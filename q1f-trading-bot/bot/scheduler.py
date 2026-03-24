"""Trading bot scheduler.

Wires together:
  • Strategy signal loop  – runs every 15 minutes (configurable via SCHEDULE_INTERVAL_MIN)
  • NAV update            – runs after every executed trade
  • Daily snapshot        – runs at 23:59 UTC for each registered strategy

Usage
-----
    from bot.scheduler import BotScheduler
    from bot.adapters.bybit_adapter import BybitAdapter
    from bot.pnl.engine import PnLEngine

    exchange = BybitAdapter()
    exchange.connect()
    engine  = PnLEngine(exchange)

    scheduler = BotScheduler(engine=engine, strategy_ids=["conservative_dca"])
    scheduler.start()          # blocks until KeyboardInterrupt
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Callable

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from bot.db.database import ensure_strategy, insert_trade, transaction
from bot.pnl.engine import PnLEngine

logger = logging.getLogger(__name__)

# How often to run the strategy signal loop (minutes)
_INTERVAL_MIN: int = int(os.getenv("SCHEDULE_INTERVAL_MIN", "15"))


class BotScheduler:
    """Drives periodic strategy execution and P&L accounting."""

    def __init__(
        self,
        engine: PnLEngine,
        strategy_ids: list[str],
        signal_handler: Callable[[str], list] | None = None,
    ) -> None:
        """
        Parameters
        ----------
        engine          PnLEngine instance (already connected to exchange)
        strategy_ids    List of strategy IDs that are active
        signal_handler  Optional callable(strategy_id) -> list[Signal].
                        If None, NAV update is still performed on each tick.
        """
        self.engine = engine
        self.strategy_ids = strategy_ids
        self.signal_handler = signal_handler
        self._scheduler = BlockingScheduler(timezone="UTC")
        self._setup_jobs()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Start the scheduler (blocks the calling thread)."""
        logger.info(
            "[Scheduler] Starting.  Strategies=%s  interval=%d min",
            self.strategy_ids, _INTERVAL_MIN,
        )
        try:
            self._scheduler.start()
        except (KeyboardInterrupt, SystemExit):
            logger.info("[Scheduler] Stopped.")

    def stop(self) -> None:
        """Gracefully stop the scheduler."""
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------

    def _setup_jobs(self) -> None:
        for sid in self.strategy_ids:
            # Strategy tick: every N minutes
            self._scheduler.add_job(
                self._tick,
                trigger=IntervalTrigger(minutes=_INTERVAL_MIN),
                args=[sid],
                id=f"tick_{sid}",
                replace_existing=True,
                next_run_time=datetime.now(tz=timezone.utc),  # run immediately on start
            )

            # Daily report: 23:59 UTC
            self._scheduler.add_job(
                self._daily_snapshot,
                trigger=CronTrigger(hour=23, minute=59, timezone="UTC"),
                args=[sid],
                id=f"daily_snapshot_{sid}",
                replace_existing=True,
            )

        logger.info("[Scheduler] Jobs registered: %s", [j.id for j in self._scheduler.get_jobs()])

    # ------------------------------------------------------------------
    # Job implementations
    # ------------------------------------------------------------------

    def _tick(self, strategy_id: str) -> None:
        """One strategy tick: generate signals → execute trades → update NAV."""
        logger.info("[Scheduler] Tick start: strategy=%s", strategy_id)
        try:
            traded = False

            if self.signal_handler is not None:
                signals = self.signal_handler(strategy_id)
                for signal in signals:
                    if self._execute_signal(signal, strategy_id):
                        traded = True

            # Always update NAV after a tick (regardless of whether a trade occurred)
            nav = self.engine.post_trade_nav_update(strategy_id)
            logger.info(
                "[Scheduler] Tick done: strategy=%s  nav=%.2f USDT  traded=%s",
                strategy_id, nav, traded,
            )
        except Exception:
            logger.exception("[Scheduler] Tick failed: strategy=%s", strategy_id)

    def _execute_signal(self, signal, strategy_id: str) -> bool:
        """Execute a single signal against the exchange and record the trade.

        Returns True if a trade was placed.
        """
        from bot.strategies.base import Action

        if signal.action == Action.HOLD:
            return False

        try:
            side = "buy" if signal.action == Action.BUY else "sell"
            # Derive amount from size_pct of NAV
            latest_nav = self.engine._get_latest_nav(strategy_id)
            if latest_nav <= 0:
                logger.warning("[Scheduler] NAV is 0, skipping trade")
                return False

            notional = latest_nav * (signal.size_pct / 100.0)
            ticker = self.engine.exchange.fetch_ticker(signal.symbol)
            price = ticker.get("last", 0.0)
            if price <= 0:
                logger.warning("[Scheduler] Price is 0 for %s, skipping", signal.symbol)
                return False

            amount = notional / price

            logger.info(
                "[Scheduler] Placing %s %s  amount=%.6f  price=%.2f  "
                "notional=%.2f USDT  reason=%s",
                side.upper(), signal.symbol, amount, price, notional, signal.reason,
            )

            order = self.engine.exchange.place_order(
                symbol=signal.symbol,
                side=side,
                amount=amount,
                order_type="market",
            )

            filled_price: float = order.get("average") or order.get("price") or price
            cost_usdt: float = order.get("cost") or amount * filled_price

            insert_trade(
                strategy_id=strategy_id,
                symbol=signal.symbol,
                side=side,
                amount=amount,
                price=filled_price,
                cost_usdt=cost_usdt,
                order_id=str(order.get("id", "")),
            )

            logger.info(
                "[Scheduler] Trade recorded: %s %s  filled=%.2f  cost=%.2f USDT",
                side.upper(), signal.symbol, filled_price, cost_usdt,
            )
            return True

        except Exception:
            logger.exception(
                "[Scheduler] Failed to execute signal: %s %s", signal.action, signal.symbol
            )
            return False

    def _daily_snapshot(self, strategy_id: str) -> None:
        logger.info("[Scheduler] Daily snapshot: strategy=%s", strategy_id)
        try:
            report = self.engine.daily_snapshot(strategy_id)
            logger.info(
                "[Scheduler] Daily report saved: strategy=%s  nav=%.2f  "
                "pnl_day=%.2f (%.2f%%)  drawdown=%.2f%%  trades=%d",
                strategy_id,
                report.nav_usdt,
                report.pnl_day,
                report.pnl_pct,
                report.drawdown_pct,
                report.trades_count,
            )
        except Exception:
            logger.exception("[Scheduler] Daily snapshot failed: strategy=%s", strategy_id)
