#!/usr/bin/env python3
"""
Entry point for the Q1F crypto trading bot.

Steps:
  1. Load config from .env
  2. Initialise SQLite database
  3. Connect to Bybit testnet via ccxt
  4. Print account balance
  5. Place a test market buy 0.001 BTC/USDT
  6. Record the trade in the database
  7. Print "Bot skeleton OK"
"""
import sys
from pathlib import Path

# Make sure the package root is on sys.path when run directly
sys.path.insert(0, str(Path(__file__).parent))

from bot.config import config
from bot.db.database import init_db, ensure_strategy, insert_trade
from bot.adapters.bybit_adapter import BybitAdapter


STRATEGY_ID = "btc_spot_v1"
STRATEGY_NAME = "BTC Spot Strategy v1"
TEST_SYMBOL = "BTC/USDT"
TEST_AMOUNT = 0.001  # BTC


def main() -> None:
    # ------------------------------------------------------------------
    # 1. Validate config
    # ------------------------------------------------------------------
    print("=== Q1F Trading Bot ===")
    print(f"Testnet : {config.BYBIT_TESTNET}")
    print(f"Capital : {config.INITIAL_CAPITAL} USDT")
    config.validate()
    print("[Config] OK")

    # ------------------------------------------------------------------
    # 2. Initialise database
    # ------------------------------------------------------------------
    init_db()
    ensure_strategy(STRATEGY_ID, STRATEGY_NAME)

    # ------------------------------------------------------------------
    # 3. Connect to Bybit testnet
    # ------------------------------------------------------------------
    exchange = BybitAdapter()
    exchange.connect()

    # ------------------------------------------------------------------
    # 4. Print balance
    # ------------------------------------------------------------------
    balance = exchange.fetch_balance()
    print("\n[Balance]")
    if balance:
        for asset, info in balance.items():
            if isinstance(info, dict):
                print(f"  {asset}: free={info.get('free', 0):.4f}  total={info.get('total', 0):.4f}")
    else:
        print("  (no non-zero balances found)")

    # ------------------------------------------------------------------
    # 5. Test market buy 0.001 BTC/USDT
    # ------------------------------------------------------------------
    print(f"\n[Order] Placing market BUY {TEST_AMOUNT} {TEST_SYMBOL} ...")
    order = exchange.place_order(
        symbol=TEST_SYMBOL,
        side="buy",
        amount=TEST_AMOUNT,
        order_type="market",
    )
    print(f"[Order] Done: id={order.get('id')}  status={order.get('status')}")

    # Derive price/cost from the order (filled price or last ticker)
    filled_price: float = order.get("average") or order.get("price") or 0.0
    if not filled_price:
        ticker = exchange.fetch_ticker(TEST_SYMBOL)
        filled_price = ticker.get("last", 0.0)

    cost_usdt: float = order.get("cost") or TEST_AMOUNT * filled_price

    # ------------------------------------------------------------------
    # 6. Record trade in DB
    # ------------------------------------------------------------------
    trade_id = insert_trade(
        strategy_id=STRATEGY_ID,
        symbol=TEST_SYMBOL,
        side="buy",
        amount=TEST_AMOUNT,
        price=filled_price,
        cost_usdt=cost_usdt,
        order_id=str(order.get("id", "")),
    )
    print(f"[DB] Trade recorded: row_id={trade_id}  price={filled_price:.2f}  cost={cost_usdt:.4f} USDT")

    # ------------------------------------------------------------------
    # 7. Done
    # ------------------------------------------------------------------
    print("\nBot skeleton OK")


if __name__ == "__main__":
    main()
