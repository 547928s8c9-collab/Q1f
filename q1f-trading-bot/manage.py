#!/usr/bin/env python3
"""Q1F Trading Bot – Management CLI (Phase 0).

Commands
--------
  deposit   Create a client position (buy shares at current NAV)
  withdraw  Close a client position and calculate payout
  status    Show all strategies: NAV, share price, total shares, active clients
  pnl       Show PnL for every active client across all strategies

Examples
--------
  python manage.py deposit  --client owner --strategy conservative --amount 5000
  python manage.py withdraw --client owner --strategy conservative
  python manage.py status
  python manage.py pnl
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from datetime import datetime

# Make the package importable when run directly
sys.path.insert(0, str(Path(__file__).parent))

from bot.config import config
from bot.db.database import init_db, ensure_strategy, transaction
from bot.adapters.bybit_adapter import BybitAdapter
from bot.pnl.engine import PnLEngine


# ---------------------------------------------------------------------------
# Known strategies:  CLI alias → (strategy_id, display_name)
# ---------------------------------------------------------------------------
STRATEGIES: dict[str, tuple[str, str]] = {
    "conservative": ("conservative_dca", "Conservative DCA Strategy"),
    "aggressive":   ("aggressive_v1",    "Aggressive Strategy"),
    "balanced":     ("balanced_v1",      "Balanced Strategy"),
}


def _resolve_strategy(alias: str) -> tuple[str, str]:
    """Map a CLI alias or raw ID to (strategy_id, name)."""
    if alias in STRATEGIES:
        return STRATEGIES[alias]
    # Allow passing the raw strategy_id directly
    return alias, alias


def _build_engine() -> PnLEngine:
    config.validate()
    exchange = BybitAdapter()
    exchange.connect()
    return PnLEngine(exchange)


def _ensure(strategy_id: str, name: str) -> None:
    ensure_strategy(strategy_id, name)


# ---------------------------------------------------------------------------
# deposit
# ---------------------------------------------------------------------------

def cmd_deposit(args: argparse.Namespace) -> None:
    strategy_id, strategy_name = _resolve_strategy(args.strategy)
    client_id = args.client
    amount = args.amount

    print(f"\n=== Deposit ===")
    print(f"  Client   : {client_id}")
    print(f"  Strategy : {strategy_name} ({strategy_id})")
    print(f"  Amount   : {amount:,.2f} USDT")

    _ensure(strategy_id, strategy_name)
    engine = _build_engine()

    position = engine.deposit(client_id, strategy_id, amount)

    print(f"\n✓ Position created")
    print(f"  Shares bought  : {position.shares:.6f}")
    print(f"  Share price    : {position.entry_share_price:.6f} USDT")
    print(f"  Position ID    : {position.id}")


# ---------------------------------------------------------------------------
# withdraw
# ---------------------------------------------------------------------------

def cmd_withdraw(args: argparse.Namespace) -> None:
    strategy_id, strategy_name = _resolve_strategy(args.strategy)
    client_id = args.client

    print(f"\n=== Withdraw ===")
    print(f"  Client   : {client_id}")
    print(f"  Strategy : {strategy_name} ({strategy_id})")

    engine = _build_engine()

    result = engine.withdraw(client_id, strategy_id)

    print(f"\n✓ Position closed")
    print(f"  Current value    : {result['current_value']:>12,.2f} USDT")
    print(f"  Profit / Loss    : {result['profit']:>+12,.2f} USDT")
    print(f"  Performance fee  : {result['performance_fee']:>12,.2f} USDT  (20% of profit)")
    print(f"  ──────────────────────────────────")
    print(f"  Payout           : {result['payout']:>12,.2f} USDT")
    print(f"  Shares redeemed  : {result['shares']:.6f}  @  {result['share_price']:.6f} USDT/share")


# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------

def cmd_status(_args: argparse.Namespace) -> None:
    print(f"\n=== Strategy Status ===")

    with transaction() as conn:
        strategies = conn.execute(
            "SELECT id, name, status, created_at FROM strategies ORDER BY created_at"
        ).fetchall()

    if not strategies:
        print("  No strategies found in database.")
        return

    for row in strategies:
        sid, name, status, created_at = row[0], row[1], row[2], row[3]

        with transaction() as conn:
            snap = conn.execute(
                """
                SELECT nav_usdt, share_price, total_shares, timestamp
                FROM nav_snapshots
                WHERE strategy_id = ?
                ORDER BY timestamp DESC LIMIT 1
                """,
                (sid,),
            ).fetchone()

            active_clients = conn.execute(
                """
                SELECT COUNT(*) FROM client_positions
                WHERE strategy_id = ? AND status = 'active'
                """,
                (sid,),
            ).fetchone()[0]

            last_report = conn.execute(
                """
                SELECT date, pnl_day, pnl_pct, drawdown_pct
                FROM daily_reports
                WHERE strategy_id = ?
                ORDER BY date DESC LIMIT 1
                """,
                (sid,),
            ).fetchone()

        print(f"\n  ┌─ {name}  [{sid}]  status={status}")
        print(f"  │  Created        : {created_at}")
        print(f"  │  Active clients : {active_clients}")

        if snap:
            nav, share_price, total_shares, ts = snap
            print(f"  │  Last NAV       : {nav:,.2f} USDT  (snapshot: {ts})")
            print(f"  │  Share price    : {share_price:.6f} USDT")
            print(f"  │  Total shares   : {total_shares:.6f}")
        else:
            print(f"  │  Last NAV       : — (no snapshots yet)")

        if last_report:
            d, pnl_day, pnl_pct, dd = last_report
            print(f"  │  Last daily rpt : {d}  pnl_day={pnl_day:+.2f} ({pnl_pct:+.2f}%)  drawdown={dd:.2f}%")

        print(f"  └─")


# ---------------------------------------------------------------------------
# pnl
# ---------------------------------------------------------------------------

def cmd_pnl(_args: argparse.Namespace) -> None:
    print(f"\n=== Client P&L ===")

    with transaction() as conn:
        positions = conn.execute(
            """
            SELECT cp.id, cp.client_id, cp.strategy_id, cp.shares,
                   cp.initial_deposit, cp.entry_share_price, cp.created_at,
                   s.name AS strategy_name
            FROM client_positions cp
            JOIN strategies s ON s.id = cp.strategy_id
            WHERE cp.status = 'active'
            ORDER BY cp.strategy_id, cp.client_id
            """
        ).fetchall()

    if not positions:
        print("  No active positions found.")
        return

    total_invested = 0.0
    total_value = 0.0

    # Cache share prices to avoid repeated DB lookups per strategy
    share_price_cache: dict[str, float] = {}

    for row in positions:
        (pos_id, client_id, strategy_id, shares,
         initial_deposit, entry_share_price, created_at, strategy_name) = (
            row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7]
        )

        if strategy_id not in share_price_cache:
            with transaction() as conn:
                snap = conn.execute(
                    """
                    SELECT share_price FROM nav_snapshots
                    WHERE strategy_id = ?
                    ORDER BY timestamp DESC LIMIT 1
                    """,
                    (strategy_id,),
                ).fetchone()
            share_price_cache[strategy_id] = float(snap[0]) if snap else 1.0

        share_price = share_price_cache[strategy_id]
        current_value = shares * share_price
        profit = current_value - initial_deposit
        pnl_pct = (profit / initial_deposit * 100) if initial_deposit else 0.0

        total_invested += initial_deposit
        total_value += current_value

        sign = "+" if profit >= 0 else ""
        print(
            f"\n  Client={client_id!r}  Strategy={strategy_name!r}  (pos#{pos_id})"
        )
        print(f"    Deposited      : {initial_deposit:>12,.2f} USDT  on {created_at}")
        print(f"    Current value  : {current_value:>12,.2f} USDT")
        print(f"    P&L            : {sign}{profit:>+12,.2f} USDT  ({sign}{pnl_pct:.2f}%)")
        print(f"    Shares         : {shares:.6f}  @  {share_price:.6f} USDT/share")

    total_profit = total_value - total_invested
    total_pct = (total_profit / total_invested * 100) if total_invested else 0.0
    sign = "+" if total_profit >= 0 else ""

    print(f"\n  {'─' * 50}")
    print(f"  Total invested : {total_invested:>12,.2f} USDT")
    print(f"  Total value    : {total_value:>12,.2f} USDT")
    print(f"  Total P&L      : {sign}{total_profit:>+12,.2f} USDT  ({sign}{total_pct:.2f}%)")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Q1F Trading Bot – Management CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # deposit
    p_dep = sub.add_parser("deposit", help="Create a client position")
    p_dep.add_argument("--client",   required=True, help="Client identifier")
    p_dep.add_argument("--strategy", required=True,
                       help="Strategy alias or ID (e.g. conservative)")
    p_dep.add_argument("--amount", required=True, type=float,
                       help="Deposit amount in USDT")

    # withdraw
    p_wit = sub.add_parser("withdraw", help="Close a client position")
    p_wit.add_argument("--client",   required=True, help="Client identifier")
    p_wit.add_argument("--strategy", required=True, help="Strategy alias or ID")

    # status
    sub.add_parser("status", help="Show strategy overview")

    # pnl
    sub.add_parser("pnl", help="Show P&L for all active clients")

    args = parser.parse_args()

    # Ensure DB tables exist before any command
    init_db()

    dispatch = {
        "deposit":  cmd_deposit,
        "withdraw": cmd_withdraw,
        "status":   cmd_status,
        "pnl":      cmd_pnl,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
