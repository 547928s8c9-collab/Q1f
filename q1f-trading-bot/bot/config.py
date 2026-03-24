import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).parent.parent / ".env")


class Config:
    # Bybit
    BYBIT_API_KEY: str = os.getenv("BYBIT_API_KEY", "")
    BYBIT_SECRET: str = os.getenv("BYBIT_SECRET", "")
    BYBIT_TESTNET: bool = os.getenv("BYBIT_TESTNET", "true").lower() == "true"

    # Telegram
    TELEGRAM_TOKEN: str = os.getenv("TELEGRAM_TOKEN", "")
    TELEGRAM_CHAT_ID: str = os.getenv("TELEGRAM_CHAT_ID", "")

    # Capital
    INITIAL_CAPITAL: float = float(os.getenv("INITIAL_CAPITAL", "10000"))

    # Database
    DB_PATH: str = os.getenv("DB_PATH", "trading_bot.db")

    # Trading defaults
    DEFAULT_SYMBOL: str = "BTC/USDT"
    DEFAULT_TIMEFRAME: str = "1h"

    @classmethod
    def validate(cls) -> None:
        if not cls.BYBIT_API_KEY:
            raise ValueError("BYBIT_API_KEY is not set")
        if not cls.BYBIT_SECRET:
            raise ValueError("BYBIT_SECRET is not set")


config = Config()
