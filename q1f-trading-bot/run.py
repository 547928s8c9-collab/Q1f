#!/usr/bin/env python3
"""
Entry point for the Q1F crypto trading bot.

Modes
-----
  python run.py          – run one-shot test (original behaviour)
  python run.py --live   – start the full scheduler loop (blocks until Ctrl-C)

Scheduler mode
--------------
  • Strategy ticks every SCHEDULE_INTERVAL_MIN minutes (default 15)
  • NAV snapshot updated after each tick
  • Daily report at 23:59 UTC
"""
import logging
import sys
from pathlib import Path

# Make sure the package root is on sys.path when run directly
sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

from bot.config import config
from bot.db.database import init_db, ensure_strategy, insert_trade
from bot.adapters.bybit_adapter import BybitAdapter
from bot.pnl.engine import PnLEngine


STRATEGY_ID   = "conservative_dca"
STRATEGY_NAME = "Conservative DCA Strategy"
TEST_SYMBOL   = "BTC/USDT"
TEST_AMOUNT   = 0.001  # BTC


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Q1F Trading Bot")
    parser.add_argument(
        "--live", action="store_true",
        help="Start the full scheduler loop (blocks until Ctrl-C)"
    )
    args = parser.parse_args()

    # ------------------------------------------------------------------
    # 1. Validate config & init DB
    # ------------------------------------------------------------------
    print("=== Q1F Trading Bot ===")
    print(f"Testnet : {config.BYBIT_TESTNET}")
    print(f"Capital : {config.INITIAL_CAPITAL} USDT")
    config.validate()
    print("[Config] OK")

    init_db()
    ensure_strategy(STRATEGY_ID, STRATEGY_NAME)

    # ------------------------------------------------------------------
    # 2. Connect to Bybit
    # ------------------------------------------------------------------
    exchange = BybitAdapter()
    exchange.connect()

    engine = PnLEngine(exchange)

    # ------------------------------------------------------------------
    # 3. Print balance
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
    # 4a. Live scheduler mode
    # ------------------------------------------------------------------
    if args.live:
        from bot.scheduler import BotScheduler
        print(f"\n[Scheduler] Starting live loop for strategy={STRATEGY_ID!r} ...")

        scheduler = BotScheduler(
            engine=engine,
            strategy_ids=[STRATEGY_ID],
            signal_handler=None,  # replace with ConservativeStrategy.generate_signal
        )
        scheduler.start()  # blocks
        return

    # ------------------------------------------------------------------
    # 4b. One-shot test (original behaviour)
    # ------------------------------------------------------------------
    print(f"\n[Order] Placing market BUY {TEST_AMOUNT} {TEST_SYMBOL} ...")
    order = exchange.place_order(
        symbol=TEST_SYMBOL,
        side="buy",
        amount=TEST_AMOUNT,
        order_type="market",
    )
    print(f"[Order] Done: id={order.get('id')}  status={order.get('status')}")

    filled_price: float = order.get("average") or order.get("price") or 0.0
    if not filled_price:
        ticker = exchange.fetch_ticker(TEST_SYMBOL)
        filled_price = ticker.get("last", 0.0)

    cost_usdt: float = order.get("cost") or TEST_AMOUNT * filled_price

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

    # Update NAV snapshot after the trade
    nav = engine.post_trade_nav_update(STRATEGY_ID)
    print(f"[PnL] NAV updated: {nav:.2f} USDT")

    print("\nBot skeleton OK")


if __name__ == "__main__":
    main()
