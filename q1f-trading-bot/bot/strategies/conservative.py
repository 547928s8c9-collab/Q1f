"""
DCA Smart — conservative strategy.

Entry  : RSI(14,4H) < 40  AND  price < SMA(50,4H)  AND  price > SMA(200,4H)
         => BUY 5 % of NAV in that asset

Exit   : RSI(14,4H) > 70  OR   price > upper Bollinger Band(20, 2σ, 4H)
         => SELL 50 % of position in that asset

Rebalance: drift > 5 % from target allocation  (checked every 15 min)
Target  : BTC/USDT 70 %, ETH/USDT 20 %, USDT cushion 10 %
Timeframe: 4H candles
"""

import logging
from typing import Any

import numpy as np
import pandas as pd
import talib

from .base import AbstractStrategy, Action, Signal

log = logging.getLogger(__name__)

# ── strategy parameters ───────────────────────────────────────────────────────
ALLOCATION_TARGET: dict[str, float] = {
    "BTC/USDT": 0.70,
    "ETH/USDT": 0.20,
    "USDT":     0.10,
}
TRADEABLE_SYMBOLS = ["BTC/USDT", "ETH/USDT"]

RSI_PERIOD        = 14
RSI_OVERSOLD      = 40.0
RSI_OVERBOUGHT    = 70.0
SMA_FAST          = 50
SMA_SLOW          = 200
BB_PERIOD         = 20
BB_STDDEV         = 2.0
TIMEFRAME         = "4h"
OHLCV_LIMIT       = 250      # enough for SMA-200
REBALANCE_DRIFT   = 0.05     # 5 %
BUY_SIZE_PCT      = 5.0      # % of NAV per entry
SELL_SIZE_PCT     = 50.0     # % of position per exit


class ConservativeStrategy(AbstractStrategy):
    """DCA Smart — low-volatility accumulation strategy."""

    def __init__(self, exchange_adapter: Any, db: Any = None) -> None:
        super().__init__(
            strategy_id="conservative_dca",
            exchange_adapter=exchange_adapter,
            db=db,
        )

    # ── public API ────────────────────────────────────────────────────────────

    def get_params(self) -> dict:
        return {
            "strategy_id":        self.strategy_id,
            "timeframe":          TIMEFRAME,
            "symbols":            TRADEABLE_SYMBOLS,
            "allocation_target":  ALLOCATION_TARGET,
            "rsi_period":         RSI_PERIOD,
            "rsi_oversold":       RSI_OVERSOLD,
            "rsi_overbought":     RSI_OVERBOUGHT,
            "sma_fast":           SMA_FAST,
            "sma_slow":           SMA_SLOW,
            "bb_period":          BB_PERIOD,
            "bb_stddev":          BB_STDDEV,
            "buy_size_pct":       BUY_SIZE_PCT,
            "sell_size_pct":      SELL_SIZE_PCT,
            "rebalance_drift":    REBALANCE_DRIFT,
            "target_return_pct":  "8-15% annually",
        }

    def generate_signal(self) -> list[Signal]:
        """Return signals for all tradeable symbols plus a rebalance check."""
        signals: list[Signal] = []

        for symbol in TRADEABLE_SYMBOLS:
            try:
                df = self._fetch_ohlcv(symbol)
                if df is None or len(df) < OHLCV_SLOW_WINDOW:
                    log.warning("%s: not enough candles, skipping", symbol)
                    continue
                sig = self._evaluate(symbol, df)
                signals.append(sig)
            except Exception as exc:
                log.error("Error evaluating %s: %s", symbol, exc)

        rebalance_signals = self._check_rebalance()
        signals.extend(rebalance_signals)

        return signals

    # ── internals ─────────────────────────────────────────────────────────────

    def _fetch_ohlcv(self, symbol: str) -> pd.DataFrame | None:
        """Fetch OHLCV candles via exchange_adapter and return a DataFrame."""
        raw = self.exchange_adapter.fetch_ohlcv(
            symbol, timeframe=TIMEFRAME, limit=OHLCV_LIMIT
        )
        if not raw:
            return None
        df = pd.DataFrame(
            raw, columns=["timestamp", "open", "high", "low", "close", "volume"]
        )
        df["close"] = df["close"].astype(float)
        df["high"]  = df["high"].astype(float)
        df["low"]   = df["low"].astype(float)
        return df

    def _evaluate(self, symbol: str, df: pd.DataFrame) -> Signal:
        """Compute indicators and decide BUY / SELL / HOLD."""
        close = df["close"].values.astype(np.float64)
        high  = df["high"].values.astype(np.float64)
        low   = df["low"].values.astype(np.float64)

        rsi      = talib.RSI(close, timeperiod=RSI_PERIOD)
        sma_fast = talib.SMA(close, timeperiod=SMA_FAST)
        sma_slow = talib.SMA(close, timeperiod=SMA_SLOW)
        _, _, bb_upper = talib.BBANDS(
            close,
            timeperiod=BB_PERIOD,
            nbdevup=BB_STDDEV,
            nbdevdn=BB_STDDEV,
            matype=0,
        )

        price      = close[-1]
        rsi_val    = float(rsi[-1])
        sma_f_val  = float(sma_fast[-1])
        sma_s_val  = float(sma_slow[-1])
        bb_up_val  = float(bb_upper[-1])

        log.debug(
            "%s  price=%.2f  RSI=%.1f  SMA50=%.2f  SMA200=%.2f  BB_up=%.2f",
            symbol, price, rsi_val, sma_f_val, sma_s_val, bb_up_val,
        )

        # ── EXIT ──────────────────────────────────────────────────────────────
        exit_rsi = rsi_val > RSI_OVERBOUGHT
        exit_bb  = price   > bb_up_val

        if exit_rsi or exit_bb:
            reasons = []
            if exit_rsi:
                reasons.append(f"RSI={rsi_val:.1f} > {RSI_OVERBOUGHT}")
            if exit_bb:
                reasons.append(f"price={price:.2f} > BB_upper={bb_up_val:.2f}")
            confidence = min(1.0, (0.6 if exit_rsi else 0.0) + (0.6 if exit_bb else 0.0))
            return Signal(
                action=Action.SELL,
                symbol=symbol,
                size_pct=SELL_SIZE_PCT,
                confidence=round(min(confidence, 1.0), 2),
                reason=" | ".join(reasons),
            )

        # ── ENTRY ─────────────────────────────────────────────────────────────
        entry_rsi      = rsi_val  < RSI_OVERSOLD
        entry_below_f  = price    < sma_f_val      # below fast SMA
        entry_above_s  = price    > sma_s_val      # above slow SMA (not bear)

        if entry_rsi and entry_below_f and entry_above_s:
            confidence = round(
                0.4
                + 0.3 * max(0.0, (RSI_OVERSOLD - rsi_val) / RSI_OVERSOLD)
                + 0.3 * max(0.0, (sma_f_val - price) / sma_f_val),
                2,
            )
            return Signal(
                action=Action.BUY,
                symbol=symbol,
                size_pct=BUY_SIZE_PCT,
                confidence=min(confidence, 1.0),
                reason=(
                    f"RSI={rsi_val:.1f} < {RSI_OVERSOLD} | "
                    f"price={price:.2f} < SMA50={sma_f_val:.2f} | "
                    f"price > SMA200={sma_s_val:.2f}"
                ),
            )

        # ── HOLD ──────────────────────────────────────────────────────────────
        return Signal(
            action=Action.HOLD,
            symbol=symbol,
            size_pct=0.0,
            confidence=0.5,
            reason=(
                f"No signal. RSI={rsi_val:.1f}, "
                f"price={price:.2f}, SMA50={sma_f_val:.2f}, SMA200={sma_s_val:.2f}"
            ),
        )

    def _check_rebalance(self) -> list[Signal]:
        """
        Compare current allocation vs target.
        Returns SELL/BUY signals to rebalance if drift > REBALANCE_DRIFT.
        Returns empty list when portfolio data is unavailable.
        """
        positions = self.get_open_positions()
        if not positions:
            return []

        # Build {symbol: value_usd} from positions
        current: dict[str, float] = {}
        for pos in positions:
            sym = getattr(pos, "symbol", None) or pos.get("symbol", "")
            val = float(getattr(pos, "value_usd", None) or pos.get("value_usd", 0))
            current[sym] = current.get(sym, 0.0) + val

        nav = sum(current.values())
        if nav <= 0:
            return []

        rebalance_signals: list[Signal] = []
        for symbol in TRADEABLE_SYMBOLS:
            target_w  = ALLOCATION_TARGET.get(symbol, 0.0)
            current_w = current.get(symbol, 0.0) / nav
            drift     = current_w - target_w

            if abs(drift) > REBALANCE_DRIFT:
                action = Action.SELL if drift > 0 else Action.BUY
                # size to trade as % of NAV to close half the gap
                size_pct = round(abs(drift) * 0.5 * 100, 2)
                rebalance_signals.append(
                    Signal(
                        action=action,
                        symbol=symbol,
                        size_pct=size_pct,
                        confidence=0.7,
                        reason=(
                            f"Rebalance: target={target_w:.0%} "
                            f"current={current_w:.0%} "
                            f"drift={drift:+.1%}"
                        ),
                    )
                )

        return rebalance_signals


# ── module-level constant used in _evaluate ───────────────────────────────────
OHLCV_SLOW_WINDOW = SMA_SLOW + RSI_PERIOD + 10   # safety margin
