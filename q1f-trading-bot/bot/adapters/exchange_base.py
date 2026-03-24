from abc import ABC, abstractmethod
from typing import Optional


class ExchangeBase(ABC):
    """Abstract base class for exchange adapters."""

    @abstractmethod
    def connect(self) -> None:
        """Establish connection / verify credentials."""
        ...

    @abstractmethod
    def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1h",
        limit: int = 100,
    ) -> list:
        """Return list of OHLCV candles: [timestamp, open, high, low, close, volume]."""
        ...

    @abstractmethod
    def fetch_balance(self) -> dict:
        """Return balance dict, e.g. {'USDT': {'free': 1000, 'total': 1000}}."""
        ...

    @abstractmethod
    def place_order(
        self,
        symbol: str,
        side: str,
        amount: float,
        order_type: str = "market",
        price: Optional[float] = None,
    ) -> dict:
        """Place an order. Returns the exchange order dict."""
        ...

    @abstractmethod
    def fetch_ticker(self, symbol: str) -> dict:
        """Return ticker dict with at least {'last': float, 'bid': float, 'ask': float}."""
        ...

    @abstractmethod
    def cancel_all_orders(self, symbol: Optional[str] = None) -> list:
        """Cancel all open orders, optionally filtered by symbol."""
        ...
