"""
Aggressive strategy — high-risk momentum.

Entry  : RSI(14,4H) < 50  AND  price > SMA(20,4H)  (momentum confirmation)
         => BUY 15% of NAV
Exit   : RSI(14,4H) > 60  OR  price > upper BB(15,1.5σ,4H)
         => SELL 30% of position

Symbols: BTC/USDT 40%, ETH/USDT 30%, SOL/USDT 30%
Timeframe: 4H
"""
import logging
from typing import Any

import numpy as np
import pandas as pd
import talib

from .base import AbstractStrategy, Action, Signal

log = logging.getLogger(__name__)

ALLOCATION_TARGET = {
    "BTC/USDT": 0.40,
    "ETH/USDT": 0.30,
    "SOL/USDT": 0.30,
}
TRADEABLE_SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT"]

RSI_PERIOD     = 14
RSI_OVERSOLD   = 55.0
RSI_OVERBOUGHT = 60.0
SMA_FAST       = 20
SMA_SLOW       = 100
BB_PERIOD      = 15
BB_STDDEV      = 1.5
TIMEFRAME      = "4h"
OHLCV_LIMIT    = 250
BUY_SIZE_PCT   = 15.0
SELL_SIZE_PCT  = 30.0
OHLCV_MIN_WINDOW = SMA_SLOW + RSI_PERIOD + 10


class AggressiveStrategy(AbstractStrategy):
    """Aggressive — high-frequency momentum strategy."""

    def __init__(self, exchange_adapter: Any, db: Any = None) -> None:
        super().__init__(
            strategy_id="aggressive_v1",
            exchange_adapter=exchange_adapter,
            db=db,
        )

    def get_params(self) -> dict:
        return {
            "strategy_id":       self.strategy_id,
            "timeframe":         TIMEFRAME,
            "symbols":           TRADEABLE_SYMBOLS,
            "allocation_target": ALLOCATION_TARGET,
            "rsi_oversold":      RSI_OVERSOLD,
            "rsi_overbought":    RSI_OVERBOUGHT,
            "buy_size_pct":      BUY_SIZE_PCT,
            "sell_size_pct":     SELL_SIZE_PCT,
        }

    def generate_signal(self) -> list[Signal]:
        signals: list[Signal] = []
        for symbol in TRADEABLE_SYMBOLS:
            try:
                df = self._fetch_ohlcv(symbol)
                if df is None or len(df) < OHLCV_MIN_WINDOW:
                    continue
                signals.append(self._evaluate(symbol, df))
            except Exception as exc:
                log.error("Error evaluating %s: %s", symbol, exc)
        return signals

    def _fetch_ohlcv(self, symbol: str) -> pd.DataFrame | None:
        raw = self.exchange_adapter.fetch_ohlcv(symbol, timeframe=TIMEFRAME, limit=OHLCV_LIMIT)
        if not raw:
            return None
        df = pd.DataFrame(raw, columns=["timestamp", "open", "high", "low", "close", "volume"])
        for col in ("close", "high", "low", "open"):
            df[col] = df[col].astype(float)
        return df

    def _evaluate(self, symbol: str, df: pd.DataFrame) -> Signal:
        close = df["close"].values.astype(np.float64)

        rsi      = talib.RSI(close, timeperiod=RSI_PERIOD)
        sma_fast = talib.SMA(close, timeperiod=SMA_FAST)
        _, _, bb_upper = talib.BBANDS(close, timeperiod=BB_PERIOD, nbdevup=BB_STDDEV, nbdevdn=BB_STDDEV)

        price   = close[-1]
        rsi_val = float(rsi[-1])
        sma_val = float(sma_fast[-1])
        bb_val  = float(bb_upper[-1])

        # EXIT
        if rsi_val > RSI_OVERBOUGHT or price > bb_val:
            return Signal(
                action=Action.SELL, symbol=symbol,
                size_pct=SELL_SIZE_PCT, confidence=0.65,
                reason=f"RSI={rsi_val:.1f} | price={price:.2f} bb_up={bb_val:.2f}",
            )

        # ENTRY — momentum: price above fast SMA + RSI not overbought
        if rsi_val < RSI_OVERSOLD and price > sma_val:
            return Signal(
                action=Action.BUY, symbol=symbol,
                size_pct=BUY_SIZE_PCT, confidence=0.55,
                reason=f"Momentum: RSI={rsi_val:.1f} | price={price:.2f} > SMA{SMA_FAST}={sma_val:.2f}",
            )

        return Signal(
            action=Action.HOLD, symbol=symbol,
            size_pct=0.0, confidence=0.5,
            reason=f"No signal. RSI={rsi_val:.1f}, price={price:.2f}",
        )
