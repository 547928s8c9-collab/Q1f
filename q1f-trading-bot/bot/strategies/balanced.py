"""
Trend Rider — balanced multi-asset strategy.

Assets  : BTC 40 %, ETH 30 %, SOL 20 %, USDT 10 % (cash reserve)
Timeframe: 1H candles, scheduler checks every 5 minutes

Market mode detection (ADX 14):
  ADX > 25  => TREND mode
  ADX < 20  => RANGE mode
  20–25     => HOLD (no new entries)

TREND entry:
  EMA(21) > EMA(55)
  AND price pullback to EMA(21) (within 0.5 %)
  AND RSI(14) > 45
  => BUY 10 % of NAV

TREND exit:
  Trailing stop 3 %
  OR EMA(21) crosses below EMA(55)

RANGE entry:
  price < lower Bollinger Band (20, 2σ)
  AND RSI(14) < 35
  => BUY 8 % of NAV

RANGE exit:
  price > upper Bollinger Band (20, 2σ)
  OR RSI(14) > 65
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd
import talib

from bot.adapters.exchange_base import ExchangeBase
from .base import (
    AbstractStrategy,
    MarketMode,
    OpenPosition,
    Signal,
    SignalAction,
)

logger = logging.getLogger(__name__)


class TrendRider(AbstractStrategy):
    """Balanced trend-following / mean-reversion strategy."""

    strategy_id   = "trend_rider_v1"
    strategy_name = "Trend Rider"

    # Portfolio weights (USDT remainder = 10 % cash reserve)
    allocation: dict[str, float] = {
        "BTC/USDT": 0.40,
        "ETH/USDT": 0.30,
        "SOL/USDT": 0.20,
    }

    timeframe      = "1h"
    check_interval = 300   # 5 minutes in seconds

    # Strategy-specific parameters
    ADX_PERIOD      = 14
    ADX_TREND_ABOVE = 25
    ADX_RANGE_BELOW = 20

    EMA_FAST        = 21
    EMA_SLOW        = 55
    PULLBACK_PCT    = 0.005   # 0.5 % distance to EMA(21) counts as pullback

    RSI_PERIOD      = 14
    RSI_TREND_MIN   = 45      # must be > 45 to enter trend trade
    RSI_RANGE_OB    = 65      # range-mode overbought exit
    RSI_RANGE_OS    = 35      # range-mode oversold entry

    BB_PERIOD       = 20
    BB_NBDEV        = 2.0

    TREND_BUY_FRAC  = 0.10   # 10 % of NAV
    RANGE_BUY_FRAC  = 0.08   # 8 % of NAV
    TRAIL_STOP_PCT  = 0.03   # 3 % trailing stop

    # ------------------------------------------------------------------

    def __init__(self, exchange: ExchangeBase, nav_usdt: float) -> None:
        super().__init__(exchange, nav_usdt)
        # Per-symbol mode cache (updated each tick)
        self._mode: dict[str, MarketMode] = {}

    # ------------------------------------------------------------------
    # Core signal logic
    # ------------------------------------------------------------------

    def compute_signals(self, ohlcv_data: dict[str, pd.DataFrame]) -> list[Signal]:
        signals: list[Signal] = []

        for symbol, df in ohlcv_data.items():
            if len(df) < self.EMA_SLOW + 10:
                logger.debug("[%s] not enough candles for %s", self.strategy_id, symbol)
                continue

            close  = self._np(df, "close")
            high   = self._np(df, "high")
            low    = self._np(df, "low")

            # --- Indicators ---
            adx    = talib.ADX(high, low, close, timeperiod=self.ADX_PERIOD)
            ema21  = talib.EMA(close, timeperiod=self.EMA_FAST)
            ema55  = talib.EMA(close, timeperiod=self.EMA_SLOW)
            rsi    = talib.RSI(close, timeperiod=self.RSI_PERIOD)
            upper, mid, lower = talib.BBANDS(
                close, timeperiod=self.BB_PERIOD, nbdevup=self.BB_NBDEV, nbdevdn=self.BB_NBDEV
            )

            # Latest values
            adx_v   = adx[-1]
            ema21_v = ema21[-1]
            ema55_v = ema55[-1]
            rsi_v   = rsi[-1]
            price   = close[-1]
            bb_up   = upper[-1]
            bb_lo   = lower[-1]

            # Previous bar for cross detection
            ema21_p = ema21[-2]
            ema55_p = ema55[-2]

            if any(np.isnan(v) for v in (adx_v, ema21_v, ema55_v, rsi_v, bb_up, bb_lo)):
                continue

            # --- Market mode ---
            if adx_v > self.ADX_TREND_ABOVE:
                mode = MarketMode.TREND
            elif adx_v < self.ADX_RANGE_BELOW:
                mode = MarketMode.RANGE
            else:
                mode = MarketMode.HOLD

            self._mode[symbol] = mode

            already_long = any(p.symbol == symbol and p.side == "buy" for p in self.positions)

            # --- Entry signals ---
            if not already_long:
                sig = self._entry_signal(
                    symbol, mode, price,
                    ema21_v, ema55_v, rsi_v, bb_lo
                )
                if sig:
                    signals.append(sig)

            # --- Exit signals (EMA cross for trend positions) ---
            if already_long and mode == MarketMode.TREND:
                ema_crossed_down = (ema21_p >= ema55_p) and (ema21_v < ema55_v)
                if ema_crossed_down:
                    signals.append(Signal(
                        action=SignalAction.SELL,
                        symbol=symbol,
                        nav_fraction=0.0,
                        reason=f"EMA cross-down adx={adx_v:.1f}",
                        price=price,
                    ))

            # --- Range-mode exit (no trailing needed — price target) ---
            if already_long and mode == MarketMode.RANGE:
                range_exit = (price > bb_up) or (rsi_v > self.RSI_RANGE_OB)
                if range_exit:
                    signals.append(Signal(
                        action=SignalAction.SELL,
                        symbol=symbol,
                        nav_fraction=0.0,
                        reason=f"range_exit rsi={rsi_v:.1f} bb_up={bb_up:.2f}",
                        price=price,
                    ))

        return signals

    # ------------------------------------------------------------------

    def _entry_signal(
        self,
        symbol: str,
        mode: MarketMode,
        price: float,
        ema21: float,
        ema55: float,
        rsi: float,
        bb_lower: float,
    ) -> Optional[Signal]:
        if mode == MarketMode.TREND:
            uptrend   = ema21 > ema55
            pullback  = abs(price - ema21) / ema21 <= self.PULLBACK_PCT
            rsi_ok    = rsi > self.RSI_TREND_MIN
            if uptrend and pullback and rsi_ok:
                return Signal(
                    action=SignalAction.BUY,
                    symbol=symbol,
                    nav_fraction=self.TREND_BUY_FRAC,
                    reason=f"trend_entry ema21={ema21:.2f} rsi={rsi:.1f}",
                    price=price,
                )

        elif mode == MarketMode.RANGE:
            oversold = price < bb_lower and rsi < self.RSI_RANGE_OS
            if oversold:
                return Signal(
                    action=SignalAction.BUY,
                    symbol=symbol,
                    nav_fraction=self.RANGE_BUY_FRAC,
                    reason=f"range_entry rsi={rsi:.1f} bb_lo={bb_lower:.2f}",
                    price=price,
                )

        return None

    # ------------------------------------------------------------------
    # Position lifecycle
    # ------------------------------------------------------------------

    def on_order_filled(self, position: OpenPosition, order: dict) -> None:
        position.trailing_stop_pct = self.TRAIL_STOP_PCT
        position.highest_price     = position.entry_price
        position.strategy_tag      = self._mode.get(position.symbol, MarketMode.HOLD).value
        self.positions.append(position)
        logger.info(
            "[%s] position opened: %s @ %.4f  tag=%s",
            self.strategy_id, position.symbol, position.entry_price, position.strategy_tag
        )

    def _should_exit(
        self,
        pos: OpenPosition,
        current_price: float,
        ohlcv_data: dict[str, pd.DataFrame],
    ) -> tuple[bool, str]:
        # Delegate to base (handles trailing stop)
        base_exit, reason = super()._should_exit(pos, current_price, ohlcv_data)
        if base_exit:
            return True, reason

        # Range positions: check BB/RSI exit via latest signals
        # (compute_signals already emits SELL signals for range exits,
        #  so the position manager only needs to handle the trailing stop here)
        return False, ""
