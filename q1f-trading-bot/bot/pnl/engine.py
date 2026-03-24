"""P&L Engine for the Q1F trading bot.

Handles NAV calculation, client deposits/withdrawals, and daily reporting.
All monetary values are in USDT.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from bot.adapters.exchange_base import ExchangeBase
from bot.db.database import transaction
from bot.db.models import ClientPosition, DailyReport, NavSnapshot

logger = logging.getLogger(__name__)

# Assets to value against USDT
_CRYPTO_ASSETS = ["BTC", "ETH", "SOL"]

# Performance fee charged on positive profit at withdrawal
PERFORMANCE_FEE_RATE = 0.20


class PnLEngine:
    """NAV-based fund accounting engine backed by a Bybit account."""

    def __init__(self, exchange: ExchangeBase) -> None:
        self.exchange = exchange

    # ------------------------------------------------------------------
    # NAV
    # ------------------------------------------------------------------

    def calculate_nav(self, strategy_id: str) -> float:
        """Fetch live balances from Bybit, compute total NAV in USDT, and
        persist a NavSnapshot.  Returns the NAV value.
        """
        balance = self.exchange.fetch_balance()

        nav = 0.0

        # Stablecoin leg
        usdt_info = balance.get("USDT")
        if isinstance(usdt_info, dict):
            nav += usdt_info.get("total", 0.0)

        # Crypto legs
        for asset in _CRYPTO_ASSETS:
            asset_info = balance.get(asset)
            if not isinstance(asset_info, dict):
                continue
            amount = asset_info.get("total", 0.0)
            if amount <= 0:
                continue
            ticker = self.exchange.fetch_ticker(f"{asset}/USDT")
            price = ticker.get("last", 0.0)
            nav += amount * price

        total_shares = self._get_total_shares(strategy_id)
        share_price = (nav / total_shares) if total_shares > 0 else 1.0

        self._insert_nav_snapshot(strategy_id, nav, share_price, total_shares)

        logger.info(
            "[PnL] NAV snapshot saved: strategy=%s  nav=%.2f USDT  "
            "share_price=%.6f  total_shares=%.6f",
            strategy_id, nav, share_price, total_shares,
        )
        return nav

    # ------------------------------------------------------------------
    # Deposit
    # ------------------------------------------------------------------

    def deposit(
        self, client_id: str, strategy_id: str, amount_usdt: float
    ) -> ClientPosition:
        """Create a new client position.

        If there are no existing shares the fund opens at 1 USDT / share.
        Otherwise the current share price (latest snapshot) is used so that
        new entrants don't dilute existing holders.
        """
        if amount_usdt <= 0:
            raise ValueError(f"Deposit amount must be positive, got {amount_usdt}")

        total_shares = self._get_total_shares(strategy_id)

        if total_shares == 0:
            share_price = 1.0
        else:
            # Fetch a fresh NAV so the share price is accurate
            nav = self.calculate_nav(strategy_id)
            share_price = nav / total_shares if total_shares > 0 else 1.0

        new_shares = amount_usdt / share_price
        now = datetime.now(tz=timezone.utc)

        with transaction() as conn:
            cursor = conn.execute(
                """
                INSERT INTO client_positions
                    (client_id, strategy_id, shares, initial_deposit,
                     entry_share_price, created_at, status)
                VALUES (?, ?, ?, ?, ?, ?, 'active')
                """,
                (client_id, strategy_id, new_shares, amount_usdt, share_price, now),
            )
            position_id = cursor.lastrowid

        position = ClientPosition(
            id=position_id,
            client_id=client_id,
            strategy_id=strategy_id,
            shares=new_shares,
            initial_deposit=amount_usdt,
            entry_share_price=share_price,
            created_at=now,
        )

        logger.info(
            "[PnL] Deposit: client=%s  strategy=%s  amount=%.2f USDT  "
            "new_shares=%.6f  share_price=%.6f",
            client_id, strategy_id, amount_usdt, new_shares, share_price,
        )
        return position

    # ------------------------------------------------------------------
    # Withdraw
    # ------------------------------------------------------------------

    def withdraw(self, client_id: str, strategy_id: str) -> dict:
        """Close an active client position and compute payout.

        Returns
        -------
        dict with keys:
            payout           – amount the client should receive (USDT)
            profit           – gross profit (USDT), may be negative
            performance_fee  – 20 % of profit if profit > 0, else 0
            current_value    – portfolio value before fee
            shares           – shares redeemed
            share_price      – price per share at exit
        """
        position = self._get_active_position(client_id, strategy_id)
        if position is None:
            raise ValueError(
                f"No active position: client={client_id!r}  strategy={strategy_id!r}"
            )

        # Fetch fresh NAV before touching the position
        total_shares = self._get_total_shares(strategy_id)
        nav = self.calculate_nav(strategy_id)
        share_price = (nav / total_shares) if total_shares > 0 else 1.0

        current_value = position.shares * share_price
        profit = current_value - position.initial_deposit
        performance_fee = (profit * PERFORMANCE_FEE_RATE) if profit > 0 else 0.0
        payout = current_value - performance_fee

        with transaction() as conn:
            conn.execute(
                "UPDATE client_positions SET status='closed' WHERE id=?",
                (position.id,),
            )

        result = {
            "payout": round(payout, 2),
            "profit": round(profit, 2),
            "performance_fee": round(performance_fee, 2),
            "current_value": round(current_value, 2),
            "shares": round(position.shares, 6),
            "share_price": round(share_price, 6),
        }

        logger.info(
            "[PnL] Withdraw: client=%s  strategy=%s  payout=%.2f  "
            "profit=%.2f  fee=%.2f",
            client_id, strategy_id, payout, profit, performance_fee,
        )
        return result

    # ------------------------------------------------------------------
    # Client PnL
    # ------------------------------------------------------------------

    def get_client_pnl(self, client_id: str, strategy_id: str) -> dict:
        """Return current PnL metrics for an active client position.

        Uses the latest stored NAV snapshot (no exchange API call).

        Returns
        -------
        dict with keys: current_value, profit, pnl_pct, shares,
                        share_price, initial_deposit
        """
        position = self._get_active_position(client_id, strategy_id)
        if position is None:
            raise ValueError(
                f"No active position: client={client_id!r}  strategy={strategy_id!r}"
            )

        share_price = self._latest_share_price(strategy_id)
        current_value = position.shares * share_price
        profit = current_value - position.initial_deposit
        pnl_pct = (
            (profit / position.initial_deposit * 100)
            if position.initial_deposit
            else 0.0
        )

        return {
            "current_value": round(current_value, 2),
            "profit": round(profit, 2),
            "pnl_pct": round(pnl_pct, 4),
            "shares": round(position.shares, 6),
            "share_price": round(share_price, 6),
            "initial_deposit": position.initial_deposit,
        }

    # ------------------------------------------------------------------
    # Daily snapshot
    # ------------------------------------------------------------------

    def daily_snapshot(self, strategy_id: str) -> DailyReport:
        """Compute and persist the end-of-day report.

        Metrics:
          - nav           : total NAV from live Bybit balances
          - pnl_day       : nav vs yesterday's last snapshot
          - pnl_pct       : pnl_day / yesterday_nav × 100
          - drawdown_pct  : (hwm - nav) / hwm × 100
          - trades_count  : trades recorded today
        """
        today = date.today()
        nav = self.calculate_nav(strategy_id)

        yesterday_nav = self._get_yesterday_nav(strategy_id, today)
        pnl_day = (nav - yesterday_nav) if yesterday_nav > 0 else 0.0
        pnl_pct = (pnl_day / yesterday_nav * 100) if yesterday_nav > 0 else 0.0

        hwm = self._get_hwm(strategy_id)
        drawdown_pct = ((hwm - nav) / hwm * 100) if hwm > 0 else 0.0

        trades_count = self._count_trades_today(strategy_id, today)

        with transaction() as conn:
            cursor = conn.execute(
                """
                INSERT INTO daily_reports
                    (strategy_id, date, nav_usdt, pnl_day, pnl_pct,
                     drawdown_pct, trades_count)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    strategy_id,
                    today.isoformat(),
                    nav,
                    pnl_day,
                    pnl_pct,
                    drawdown_pct,
                    trades_count,
                ),
            )
            report_id = cursor.lastrowid

        report = DailyReport(
            id=report_id,
            strategy_id=strategy_id,
            date=today,
            nav_usdt=nav,
            pnl_day=pnl_day,
            pnl_pct=pnl_pct,
            drawdown_pct=drawdown_pct,
            trades_count=trades_count,
        )

        logger.info(
            "[PnL] Daily report saved: strategy=%s  nav=%.2f  "
            "pnl_day=%.2f (%.2f%%)  drawdown=%.2f%%  trades=%d",
            strategy_id, nav, pnl_day, pnl_pct, drawdown_pct, trades_count,
        )
        return report

    # ------------------------------------------------------------------
    # Scheduler integration
    # ------------------------------------------------------------------

    def create_scheduler(self, strategy_ids: list[str]) -> BackgroundScheduler:
        """Return a BackgroundScheduler with:
          - daily_snapshot at 23:59 UTC for each strategy_id
        Start it with ``scheduler.start()``.
        """
        scheduler = BackgroundScheduler(timezone="UTC")

        for sid in strategy_ids:
            scheduler.add_job(
                self.daily_snapshot,
                trigger=CronTrigger(hour=23, minute=59, timezone="UTC"),
                args=[sid],
                id=f"daily_snapshot_{sid}",
                replace_existing=True,
            )

        logger.info(
            "[PnL] Scheduler configured for strategies: %s", strategy_ids
        )
        return scheduler

    def post_trade_nav_update(self, strategy_id: str) -> float:
        """Call this hook after each trade to keep NAV snapshots fresh.

        Designed to be wired into the trading scheduler:
            engine.post_trade_nav_update(strategy_id)
        """
        return self.calculate_nav(strategy_id)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _get_total_shares(self, strategy_id: str) -> float:
        """Sum of shares across all *active* client positions."""
        with transaction() as conn:
            row = conn.execute(
                """
                SELECT COALESCE(SUM(shares), 0.0)
                FROM client_positions
                WHERE strategy_id = ? AND status = 'active'
                """,
                (strategy_id,),
            ).fetchone()
        return float(row[0]) if row else 0.0

    def _get_latest_nav(self, strategy_id: str) -> float:
        """Most recent NAV from stored snapshots (0.0 if none)."""
        with transaction() as conn:
            row = conn.execute(
                """
                SELECT nav_usdt FROM nav_snapshots
                WHERE strategy_id = ?
                ORDER BY timestamp DESC LIMIT 1
                """,
                (strategy_id,),
            ).fetchone()
        return float(row[0]) if row else 0.0

    def _latest_share_price(self, strategy_id: str) -> float:
        """Share price from the most recent snapshot (1.0 if none)."""
        with transaction() as conn:
            row = conn.execute(
                """
                SELECT share_price FROM nav_snapshots
                WHERE strategy_id = ?
                ORDER BY timestamp DESC LIMIT 1
                """,
                (strategy_id,),
            ).fetchone()
        return float(row[0]) if row else 1.0

    def _insert_nav_snapshot(
        self,
        strategy_id: str,
        nav: float,
        share_price: float,
        total_shares: float,
    ) -> None:
        now = datetime.now(tz=timezone.utc)
        with transaction() as conn:
            conn.execute(
                """
                INSERT INTO nav_snapshots
                    (strategy_id, nav_usdt, share_price, total_shares, timestamp)
                VALUES (?, ?, ?, ?, ?)
                """,
                (strategy_id, nav, share_price, total_shares, now),
            )

    def _get_active_position(
        self, client_id: str, strategy_id: str
    ) -> Optional[ClientPosition]:
        with transaction() as conn:
            row = conn.execute(
                """
                SELECT id, client_id, strategy_id, shares, initial_deposit,
                       entry_share_price, created_at, status
                FROM client_positions
                WHERE client_id = ? AND strategy_id = ? AND status = 'active'
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (client_id, strategy_id),
            ).fetchone()

        if row is None:
            return None

        return ClientPosition(
            id=row[0],
            client_id=row[1],
            strategy_id=row[2],
            shares=float(row[3]),
            initial_deposit=float(row[4]),
            entry_share_price=float(row[5]),
            created_at=datetime.fromisoformat(str(row[6])),
            status=row[7],
        )

    def _get_yesterday_nav(self, strategy_id: str, today: date) -> float:
        """Last NAV snapshot recorded before today (0.0 if none)."""
        with transaction() as conn:
            row = conn.execute(
                """
                SELECT nav_usdt FROM nav_snapshots
                WHERE strategy_id = ? AND date(timestamp) < ?
                ORDER BY timestamp DESC LIMIT 1
                """,
                (strategy_id, today.isoformat()),
            ).fetchone()
        return float(row[0]) if row else 0.0

    def _get_hwm(self, strategy_id: str) -> float:
        """All-time high NAV (high-water mark) from snapshots."""
        with transaction() as conn:
            row = conn.execute(
                "SELECT MAX(nav_usdt) FROM nav_snapshots WHERE strategy_id = ?",
                (strategy_id,),
            ).fetchone()
        return float(row[0]) if (row and row[0] is not None) else 0.0

    def _count_trades_today(self, strategy_id: str, today: date) -> int:
        with transaction() as conn:
            row = conn.execute(
                """
                SELECT COUNT(*) FROM trades
                WHERE strategy_id = ? AND date(timestamp) = ?
                """,
                (strategy_id, today.isoformat()),
            ).fetchone()
        return int(row[0]) if row else 0
