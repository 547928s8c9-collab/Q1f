import ccxt
from typing import Optional

from .exchange_base import ExchangeBase
from bot.config import config


class BybitAdapter(ExchangeBase):
    """Bybit exchange adapter via ccxt. Supports testnet and mainnet."""

    def __init__(self) -> None:
        options: dict = {
            "defaultType": "spot",
        }
        if config.BYBIT_TESTNET:
            options["testnet"] = True

        self.exchange = ccxt.bybit(
            {
                "apiKey": config.BYBIT_API_KEY,
                "secret": config.BYBIT_SECRET,
                "options": options,
            }
        )

        if config.BYBIT_TESTNET:
            self.exchange.set_sandbox_mode(True)

    # ------------------------------------------------------------------
    def connect(self) -> None:
        """Verify credentials by loading markets."""
        self.exchange.load_markets()
        print(
            f"[BybitAdapter] Connected to Bybit "
            f"{'TESTNET' if config.BYBIT_TESTNET else 'MAINNET'}. "
            f"Markets loaded: {len(self.exchange.markets)}"
        )

    # ------------------------------------------------------------------
    def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str = "1h",
        limit: int = 100,
    ) -> list:
        return self.exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)

    # ------------------------------------------------------------------
    def fetch_balance(self) -> dict:
        balance = self.exchange.fetch_balance()
        # Return only non-zero balances for readability
        return {
            asset: info
            for asset, info in balance.items()
            if isinstance(info, dict) and info.get("total", 0) > 0
        }

    # ------------------------------------------------------------------
    def place_order(
        self,
        symbol: str,
        side: str,
        amount: float,
        order_type: str = "market",
        price: Optional[float] = None,
    ) -> dict:
        if order_type == "market":
            return self.exchange.create_order(symbol, order_type, side, amount)
        return self.exchange.create_order(symbol, order_type, side, amount, price)

    # ------------------------------------------------------------------
    def fetch_ticker(self, symbol: str) -> dict:
        return self.exchange.fetch_ticker(symbol)

    # ------------------------------------------------------------------
    def cancel_all_orders(self, symbol: Optional[str] = None) -> list:
        if symbol:
            return self.exchange.cancel_all_orders(symbol)
        # Cancel across all symbols — ccxt cancel_all_orders supports None on some exchanges
        try:
            return self.exchange.cancel_all_orders()
        except ccxt.NotSupported:
            open_orders = self.exchange.fetch_open_orders()
            cancelled = []
            for order in open_orders:
                cancelled.append(self.exchange.cancel_order(order["id"], order["symbol"]))
            return cancelled
