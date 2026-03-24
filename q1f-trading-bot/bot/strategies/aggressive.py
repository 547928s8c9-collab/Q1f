"""
Breakout Hunter — aggressive short-timeframe breakout strategy.

Assets  : BTC 30 %, ETH 30 %, SOL 30 %, USDT 10 % (cash reserve)
Timeframe: 15 M candles, scheduler checks every 1 minute

Entry:
  price > max(high, last 96 candles)      — 24-hour high breakout
  AND volume > 1.5 × SMA(volume, 20)     — volume confirmation
  AND RSI(14) > 55                         — momentum confirmation
  => BUY 8 % of NAV

Exit:
  Hard stop-loss  2 %
  OR trailing take-profit 1.5 % from peak
  OR time-based: 4 hours without reaching ≥ 0.5 % profit => close at market

Risk limits:
  Max 3 simultaneous open positions (across all symbols)
  Daily loss > 8 % of starting NAV => halt trading for the rest of the day
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np
import pandas as pd
import talib

from bot.adapters.exchange_base import ExchangeBase
from .base import (
    AbstractStrategy,
    OpenPosition,
    Signal,
    SignalAction,
)

logger = logging.getLogger(__name__)


class BreakoutHunter(AbstractStrategy):
    """Aggressive breakout strategy with strict risk controls."""

    strategy_id   = "breakout_hunter_v1"
    strategy_name = "Breakout Hunter"

    allocation: dict[str, float] = {
        "BTC/USDT": 0.30,
        "ETH/USDT": 0.30,
        "SOL/USDT": 0.30,
    }

    timeframe      = "15m"
    check_interval = 60   # 1 minute in seconds

    # --- Strategy parameters ---
    BREAKOUT_LOOKBACK   = 96              # candles for high-of-range (96 × 15 min = 24 h)
    VOLUME_SMA_PERIOD   = 20
    VOLUME_MULTIPLIER   = 1.5

    RSI_PERIOD          = 14
    RSI_ENTRY_MIN       = 55

    ENTRY_NAV_FRAC      = 0.08            # 8 % of NAV per trade
    STOP_LOSS_PCT       = 0.02            # 2 %
    TRAIL_STOP_PCT      = 0.015           # 1.5 % trailing take-profit
    MIN_PROFIT_PCT      = 0.005           # 0.5 % — threshold for time-based exit check
    TIME_LIMIT_HOURS    = 4               # close if no ≥ MIN_PROFIT_PCT within this window

    MAX_POSITIONS       = 3              # max simultaneous open positions
    DAILY_LOSS_LIMIT    = 0.08           # 8 % daily loss halts trading

    # ------------------------------------------------------------------

    def __init__(self, exchange: ExchangeBase, nav_usdt: float) -> None:
        super().__init__(exchange, nav_usdt)
        self._day_start_nav:  float             = nav_usdt
        self._trading_halted: bool              = False
        self._halt_until:     Optional[datetime] = None
        self._today:          str               = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # ------------------------------------------------------------------
    # Risk guard helpers
    # ------------------------------------------------------------------

    def _reset_daily_nav_if_new_day(self) -> None:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if today != self._today:
            self._today          = today
            self._day_start_nav  = self.nav_usdt
            self._trading_halted = False
            self._halt_until     = None
            logger.info("[%s] new trading day — daily stats reset.", self.strategy_id)

    def _check_daily_loss_limit(self) -> bool:
        """Return True if daily loss limit is breached (trading should halt)."""
        loss_pct = (self._day_start_nav - self.nav_usdt) / self._day_start_nav
        return loss_pct >= self.DAILY_LOSS_LIMIT

    def _is_halted(self) -> bool:
        if not self._trading_halted:
            return False
        if self._halt_until and datetime.now(timezone.utc) >= self._halt_until:
            self._trading_halted = False
            self._halt_until     = None
            logger.info("[%s] trading halt lifted.", self.strategy_id)
            return False
        return True

    def _halt_for_day(self) -> None:
        now = datetime.now(timezone.utc)
        # Halt until midnight UTC
        tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        self._trading_halted = True
        self._halt_until     = tomorrow
        logger.warning(
            "[%s] daily loss limit hit — trading halted until %s",
            self.strategy_id, tomorrow.isoformat()
        )

    # ------------------------------------------------------------------
    # Core signal logic
    # ------------------------------------------------------------------

    def on_tick(self) -> None:
        """Override to inject daily-limit guard before standard tick."""
        self._reset_daily_nav_if_new_day()

        if self._is_halted():
            logger.info("[%s] tick skipped — trading halted.", self.strategy_id)
            return

        if self._check_daily_loss_limit():
            self._halt_for_day()
            return

        super().on_tick()

    def compute_signals(self, ohlcv_data: dict[str, pd.DataFrame]) -> list[Signal]:
        signals: list[Signal] = []

        open_count = len(self.positions)

        for symbol, df in ohlcv_data.items():
            if len(df) < self.BREAKOUT_LOOKBACK + self.VOLUME_SMA_PERIOD + 5:
                logger.debug("[%s] not enough candles for %s", self.strategy_id, symbol)
                continue

            close  = self._np(df, "close")
            high   = self._np(df, "high")
            volume = self._np(df, "volume")

            rsi        = talib.RSI(close, timeperiod=self.RSI_PERIOD)
            volume_sma = talib.SMA(volume, timeperiod=self.VOLUME_SMA_PERIOD)

            price      = close[-1]
            rsi_v      = rsi[-1]
            vol_v      = volume[-1]
            vol_sma_v  = volume_sma[-1]

            # Breakout level = highest high over previous BREAKOUT_LOOKBACK candles
            # (excluding the current candle)
            breakout_level = float(np.max(high[-self.BREAKOUT_LOOKBACK - 1 : -1]))

            if any(np.isnan(v) for v in (rsi_v, vol_sma_v, breakout_level)):
                continue

            already_long = any(p.symbol == symbol and p.side == "buy" for p in self.positions)

            if (
                not already_long
                and open_count < self.MAX_POSITIONS
                and price > breakout_level
                and vol_v > self.VOLUME_MULTIPLIER * vol_sma_v
                and rsi_v > self.RSI_ENTRY_MIN
            ):
                signals.append(Signal(
                    action=SignalAction.BUY,
                    symbol=symbol,
                    nav_fraction=self.ENTRY_NAV_FRAC,
                    reason=(
                        f"breakout price={price:.4f} > level={breakout_level:.4f} "
                        f"vol_ratio={vol_v / vol_sma_v:.2f} rsi={rsi_v:.1f}"
                    ),
                    price=price,
                ))
                open_count += 1  # reserve the slot optimistically

        return signals

    # ------------------------------------------------------------------
    # Position lifecycle
    # ------------------------------------------------------------------

    def on_order_filled(self, position: OpenPosition, order: dict) -> None:
        position.stop_loss_pct      = self.STOP_LOSS_PCT
        position.trailing_stop_pct  = self.TRAIL_STOP_PCT
        position.highest_price      = position.entry_price
        self.positions.append(position)
        logger.info(
            "[%s] breakout position opened: %s @ %.4f  stop=%.1f%%  trail=%.1f%%",
            self.strategy_id, position.symbol, position.entry_price,
            self.STOP_LOSS_PCT * 100, self.TRAIL_STOP_PCT * 100,
        )

    def _should_exit(
        self,
        pos: OpenPosition,
        current_price: float,
        ohlcv_data: dict[str, pd.DataFrame],
    ) -> tuple[bool, str]:
        # Hard stop-loss + trailing stop from base class
        base_exit, reason = super()._should_exit(pos, current_price, ohlcv_data)
        if base_exit:
            return True, reason

        # Time-based exit: position held > TIME_LIMIT_HOURS without reaching MIN_PROFIT_PCT
        age = datetime.now(timezone.utc) - pos.entry_time
        if age >= timedelta(hours=self.TIME_LIMIT_HOURS):
            profit_pct = (current_price - pos.entry_price) / pos.entry_price
            if profit_pct < self.MIN_PROFIT_PCT:
                return True, (
                    f"time_exit age={age} profit={profit_pct:.2%} "
                    f"< threshold={self.MIN_PROFIT_PCT:.2%}"
                )

        return False, ""
