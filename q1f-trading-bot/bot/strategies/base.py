"""
Abstract base class for all trading strategies.

Every concrete strategy must implement:
  - strategy_id / strategy_name — unique identifiers
  - symbols / allocation        — assets and their target weight
  - timeframe / check_interval  — data granularity and polling frequency
  - on_tick()                   — called by the scheduler on each interval
  - compute_signals()           — pure-logic signal computation (testable)
  - on_order_filled()           — hook called after an order is confirmed filled
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

import numpy as np
import pandas as pd

from bot.adapters.exchange_base import ExchangeBase
from bot.db.database import ensure_strategy, insert_trade

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Shared enums / value objects
# ---------------------------------------------------------------------------

class MarketMode(Enum):
    TREND = "trend"
    RANGE = "range"
    HOLD  = "hold"


class SignalAction(Enum):
    BUY   = "buy"
    SELL  = "sell"
    HOLD  = "hold"


@dataclass
class Signal:
    action: SignalAction
    symbol: str
    nav_fraction: float         # fraction of total NAV to allocate (e.g. 0.10)
    reason: str = ""
    price: Optional[float] = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class OpenPosition:
    symbol: str
    side: str                   # "buy" | "sell"
    amount: float               # base currency amount
    entry_price: float
    entry_time: datetime
    order_id: str
    trailing_stop_pct: Optional[float] = None   # e.g. 0.03 for 3 %
    stop_loss_pct: Optional[float] = None        # e.g. 0.02 for 2 %
    highest_price: float = 0.0  # for trailing stop tracking
    strategy_tag: str = ""      # arbitrary label


# ---------------------------------------------------------------------------
# AbstractStrategy
# ---------------------------------------------------------------------------

class AbstractStrategy(ABC):
    """
    Base class wiring together exchange access, DB persistence and signal logic.

    Subclasses define the *what* (signals); this class handles the *how*
    (fetching data, placing orders, recording trades, managing positions).
    """

    # -- must be overridden by subclass --
    strategy_id:   str
    strategy_name: str

    # Asset allocation: {symbol -> weight}  weights must sum to ≤ 1.0
    # (remaining weight stays as USDT reserve)
    allocation: dict[str, float]

    timeframe:      str   # ccxt timeframe string, e.g. "1h" or "15m"
    check_interval: int   # seconds between on_tick() calls

    # ------------------------------------------------------------------
    def __init__(self, exchange: ExchangeBase, nav_usdt: float) -> None:
        self.exchange  = exchange
        self.nav_usdt  = nav_usdt
        self.positions: list[OpenPosition] = []
        self._ensure_registered()

    # ------------------------------------------------------------------
    # Lifecycle hooks
    # ------------------------------------------------------------------

    def _ensure_registered(self) -> None:
        ensure_strategy(self.strategy_id, self.strategy_name)
        logger.info("[%s] registered in DB.", self.strategy_id)

    def on_tick(self) -> None:
        """
        Main entry point called by the scheduler.

        Default flow:
          1. Fetch OHLCV for each symbol.
          2. Compute signals.
          3. Execute signals via the exchange.
          4. Update trailing stops / time-based exits on open positions.
        """
        logger.debug("[%s] tick at %s", self.strategy_id, datetime.now(timezone.utc))
        try:
            ohlcv_data = self._fetch_all_ohlcv()
            signals    = self.compute_signals(ohlcv_data)
            self._execute_signals(signals, ohlcv_data)
            self._manage_open_positions(ohlcv_data)
        except Exception as exc:
            logger.exception("[%s] error during tick: %s", self.strategy_id, exc)

    @abstractmethod
    def compute_signals(self, ohlcv_data: dict[str, pd.DataFrame]) -> list[Signal]:
        """
        Pure-logic method: given OHLCV dataframes keyed by symbol,
        return a list of Signal objects.  No side-effects allowed here.
        """
        ...

    def on_order_filled(self, position: OpenPosition, order: dict) -> None:
        """Optional hook — called after an order is confirmed filled."""

    # ------------------------------------------------------------------
    # Position management
    # ------------------------------------------------------------------

    def _manage_open_positions(self, ohlcv_data: dict[str, pd.DataFrame]) -> None:
        """Check trailing stops and strategy-specific exit conditions."""
        for pos in list(self.positions):
            ticker = self.exchange.fetch_ticker(pos.symbol)
            current_price: float = ticker.get("last", pos.entry_price)

            # Update highest price for trailing stop
            if current_price > pos.highest_price:
                pos.highest_price = current_price

            should_exit, reason = self._should_exit(pos, current_price, ohlcv_data)
            if should_exit:
                self._close_position(pos, reason)

    def _should_exit(
        self,
        pos: OpenPosition,
        current_price: float,
        ohlcv_data: dict[str, pd.DataFrame],
    ) -> tuple[bool, str]:
        """
        Default exit checks: trailing stop and hard stop-loss.
        Subclasses override to add strategy-specific logic.
        """
        # Hard stop-loss
        if pos.stop_loss_pct is not None:
            loss_pct = (pos.entry_price - current_price) / pos.entry_price
            if loss_pct >= pos.stop_loss_pct:
                return True, f"stop_loss {loss_pct:.2%}"

        # Trailing stop
        if pos.trailing_stop_pct is not None and pos.highest_price > 0:
            drawdown = (pos.highest_price - current_price) / pos.highest_price
            if drawdown >= pos.trailing_stop_pct:
                return True, f"trailing_stop drawdown={drawdown:.2%}"

        return False, ""

    def _close_position(self, pos: OpenPosition, reason: str) -> None:
        logger.info(
            "[%s] closing %s %s — reason: %s",
            self.strategy_id, pos.symbol, pos.side, reason
        )
        try:
            order = self.exchange.place_order(
                symbol=pos.symbol,
                side="sell" if pos.side == "buy" else "buy",
                amount=pos.amount,
                order_type="market",
            )
            self._record_trade(pos.symbol, "sell", pos.amount, order)
            self.positions.remove(pos)
            logger.info("[%s] position closed: %s", self.strategy_id, order.get("id"))
        except Exception as exc:
            logger.exception("[%s] failed to close position: %s", self.strategy_id, exc)

    # ------------------------------------------------------------------
    # Signal execution
    # ------------------------------------------------------------------

    def _execute_signals(
        self,
        signals: list[Signal],
        ohlcv_data: dict[str, pd.DataFrame],
    ) -> None:
        for signal in signals:
            if signal.action == SignalAction.BUY:
                self._open_long(signal)
            elif signal.action == SignalAction.SELL:
                # Close matching open position if exists
                matching = [p for p in self.positions if p.symbol == signal.symbol]
                for pos in matching:
                    self._close_position(pos, signal.reason)

    def _open_long(self, signal: Signal) -> None:
        order_value_usdt = self.nav_usdt * signal.nav_fraction
        price = signal.price or self._last_price(signal.symbol)
        if price <= 0:
            logger.warning("[%s] invalid price for %s, skipping buy", self.strategy_id, signal.symbol)
            return

        amount = order_value_usdt / price
        logger.info(
            "[%s] BUY %s  amount=%.6f  ~%.2f USDT  reason=%s",
            self.strategy_id, signal.symbol, amount, order_value_usdt, signal.reason,
        )
        try:
            order = self.exchange.place_order(
                symbol=signal.symbol,
                side="buy",
                amount=amount,
                order_type="market",
            )
            filled_price = order.get("average") or order.get("price") or price
            self._record_trade(signal.symbol, "buy", amount, order)
            self.on_order_filled(
                OpenPosition(
                    symbol=signal.symbol,
                    side="buy",
                    amount=amount,
                    entry_price=filled_price,
                    entry_time=datetime.now(timezone.utc),
                    order_id=str(order.get("id", "")),
                ),
                order,
            )
        except Exception as exc:
            logger.exception("[%s] order failed: %s", self.strategy_id, exc)

    # ------------------------------------------------------------------
    # Data helpers
    # ------------------------------------------------------------------

    def _fetch_all_ohlcv(self, limit: int = 150) -> dict[str, pd.DataFrame]:
        """Fetch OHLCV for every symbol in allocation and return as DataFrames."""
        result: dict[str, pd.DataFrame] = {}
        for symbol in self.allocation:
            raw = self.exchange.fetch_ohlcv(symbol, timeframe=self.timeframe, limit=limit)
            df  = pd.DataFrame(raw, columns=["timestamp", "open", "high", "low", "close", "volume"])
            df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
            df.set_index("timestamp", inplace=True)
            result[symbol] = df
        return result

    def _last_price(self, symbol: str) -> float:
        try:
            return float(self.exchange.fetch_ticker(symbol).get("last", 0.0))
        except Exception:
            return 0.0

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _record_trade(self, symbol: str, side: str, amount: float, order: dict) -> None:
        price     = float(order.get("average") or order.get("price") or 0)
        cost_usdt = float(order.get("cost") or amount * price)
        order_id  = str(order.get("id", ""))
        row_id    = insert_trade(
            strategy_id=self.strategy_id,
            symbol=symbol,
            side=side,
            amount=amount,
            price=price,
            cost_usdt=cost_usdt,
            order_id=order_id,
        )
        logger.info("[%s] trade recorded id=%s  row=%s", self.strategy_id, order_id, row_id)

    # ------------------------------------------------------------------
    # Utility: numpy arrays from DataFrame columns (for ta-lib)
    # ------------------------------------------------------------------

    @staticmethod
    def _np(df: pd.DataFrame, col: str) -> np.ndarray:
        return df[col].to_numpy(dtype=float)
