from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any


class Action(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


@dataclass
class Signal:
    action: Action
    symbol: str
    size_pct: float      # % of NAV to buy/sell
    confidence: float    # 0.0 – 1.0
    reason: str


class AbstractStrategy(ABC):
    def __init__(self, strategy_id: str, exchange_adapter: Any, db: Any) -> None:
        self.strategy_id = strategy_id
        self.exchange_adapter = exchange_adapter
        self.db = db

    @abstractmethod
    def generate_signal(self) -> list[Signal]:
        """Analyse market and return a list of trading signals."""

    @abstractmethod
    def get_params(self) -> dict:
        """Return strategy configuration parameters."""

    def get_open_positions(self) -> list:
        """Return open positions from DB for this strategy."""
        if self.db is None:
            return []
        return self.db.get_positions(strategy_id=self.strategy_id)
