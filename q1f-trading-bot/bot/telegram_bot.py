"""Telegram bot for the Q1F trading bot.

Commands
--------
  /start     — Welcome message
  /status    — Show NAV for all strategies
  /halt <strategy>   — Halt a strategy (stop trading)
  /resume <strategy> — Resume a halted strategy
  /backtest <strategy> [days] [capital] — Run backtest and send results
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import threading
from pathlib import Path

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot.config import config
from bot.db.database import transaction, ensure_strategy

logger = logging.getLogger(__name__)

# Strategy registry: managed by run.py, maps alias -> strategy_id
STRATEGY_ALIASES: dict[str, str] = {
    "conservative": "conservative_dca",
    "balanced":     "balanced_v1",
    "aggressive":   "aggressive_v1",
}

# Halted strategies set — shared state
_halted_strategies: set[str] = set()
_halted_lock = threading.Lock()


def is_strategy_halted(strategy_id: str) -> bool:
    with _halted_lock:
        return strategy_id in _halted_strategies


def halt_strategy(strategy_id: str) -> None:
    with _halted_lock:
        _halted_strategies.add(strategy_id)


def resume_strategy(strategy_id: str) -> None:
    with _halted_lock:
        _halted_strategies.discard(strategy_id)


def _resolve_alias(text: str) -> str | None:
    """Resolve a user-typed alias to strategy_id. Returns None if unknown."""
    text = text.strip().lower()
    if text in STRATEGY_ALIASES:
        return STRATEGY_ALIASES[text]
    # Also accept raw strategy_id
    if text in STRATEGY_ALIASES.values():
        return text
    return None


def _get_alias(strategy_id: str) -> str:
    """Get display alias from strategy_id."""
    for alias, sid in STRATEGY_ALIASES.items():
        if sid == strategy_id:
            return alias
    return strategy_id


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Q1F Trading Bot\n\n"
        "Commands:\n"
        "/status — NAV for all strategies\n"
        "/halt <strategy> — Stop trading\n"
        "/resume <strategy> — Resume trading\n"
        "/backtest <strategy> [days] [capital] — Run backtest\n"
    )


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show NAV for all strategies."""
    try:
        with transaction() as conn:
            strategies = conn.execute(
                "SELECT id, name, status FROM strategies ORDER BY created_at"
            ).fetchall()

        if not strategies:
            await update.message.reply_text("No strategies in database.")
            return

        lines = ["*Strategy Status*\n"]
        for row in strategies:
            sid, name, status = row[0], row[1], row[2]
            halted = is_strategy_halted(sid)

            with transaction() as conn:
                snap = conn.execute(
                    "SELECT nav_usdt, share_price, total_shares FROM nav_snapshots "
                    "WHERE strategy_id = ? ORDER BY timestamp DESC LIMIT 1",
                    (sid,),
                ).fetchone()
                active = conn.execute(
                    "SELECT COUNT(*) FROM client_positions "
                    "WHERE strategy_id = ? AND status = 'active'",
                    (sid,),
                ).fetchone()[0]

            state_emoji = "HALTED" if halted else "ACTIVE"
            nav_str = f"{snap[0]:,.2f}" if snap else "—"
            sp_str = f"{snap[1]:.6f}" if snap else "—"

            lines.append(
                f"*{name}* [{state_emoji}]\n"
                f"  NAV: {nav_str} USDT\n"
                f"  Share price: {sp_str}\n"
                f"  Clients: {active}\n"
            )

        await update.message.reply_text("\n".join(lines), parse_mode="Markdown")

    except Exception as exc:
        logger.exception("Error in /status")
        await update.message.reply_text(f"Error: {exc}")


async def cmd_halt(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Halt a strategy."""
    if not context.args:
        await update.message.reply_text("Usage: /halt <strategy>\nE.g. /halt conservative")
        return

    strategy_id = _resolve_alias(context.args[0])
    if strategy_id is None:
        await update.message.reply_text(
            f"Unknown strategy: {context.args[0]}\n"
            f"Available: {', '.join(STRATEGY_ALIASES.keys())}"
        )
        return

    halt_strategy(strategy_id)
    alias = _get_alias(strategy_id)
    await update.message.reply_text(f"Strategy *{alias}* (`{strategy_id}`) is now HALTED.", parse_mode="Markdown")
    logger.info("[Telegram] Strategy halted: %s", strategy_id)


async def cmd_resume(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Resume a halted strategy."""
    if not context.args:
        await update.message.reply_text("Usage: /resume <strategy>\nE.g. /resume conservative")
        return

    strategy_id = _resolve_alias(context.args[0])
    if strategy_id is None:
        await update.message.reply_text(
            f"Unknown strategy: {context.args[0]}\n"
            f"Available: {', '.join(STRATEGY_ALIASES.keys())}"
        )
        return

    resume_strategy(strategy_id)
    alias = _get_alias(strategy_id)
    await update.message.reply_text(f"Strategy *{alias}* (`{strategy_id}`) is now ACTIVE.", parse_mode="Markdown")
    logger.info("[Telegram] Strategy resumed: %s", strategy_id)


async def cmd_backtest(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Run a backtest and send results."""
    # Parse args: /backtest <strategy> [days] [capital]
    if not context.args:
        await update.message.reply_text(
            "Usage: /backtest <strategy> [days] [capital]\n"
            "E.g. /backtest conservative 180 10000"
        )
        return

    strategy_name = context.args[0].lower()
    if strategy_name not in STRATEGY_ALIASES:
        await update.message.reply_text(
            f"Unknown strategy: {strategy_name}\n"
            f"Available: {', '.join(STRATEGY_ALIASES.keys())}"
        )
        return

    days = int(context.args[1]) if len(context.args) > 1 else 180
    capital = float(context.args[2]) if len(context.args) > 2 else 10_000.0

    await update.message.reply_text(
        f"Running backtest: {strategy_name}, {days} days, {capital:,.0f} USDT...\n"
        f"This may take a minute."
    )

    try:
        # Run backtest in a thread to avoid blocking the event loop
        loop = asyncio.get_event_loop()
        from backtest.runner import run_backtest
        result, json_path, png_path = await loop.run_in_executor(
            None, run_backtest, strategy_name, days, capital
        )

        # Send JSON summary
        summary_text = (
            f"*Backtest: {strategy_name}*\n"
            f"Period: {result.days} days\n"
            f"Capital: {result.initial_capital:,.0f} -> {result.final_capital:,.2f} USDT\n"
            f"Return: {result.total_return_pct:+.2f}%\n"
            f"Ann. Return: {result.annualized_return_pct:+.2f}%\n"
            f"Max DD: {result.max_drawdown_pct:.2f}%\n"
            f"Sharpe: {result.sharpe_ratio:.4f}\n"
            f"Win Rate: {result.win_rate_pct:.1f}%\n"
            f"Trades: {result.total_trades}\n"
        )
        await update.message.reply_text(summary_text, parse_mode="Markdown")

        # Send JSON file
        if json_path.exists():
            await update.message.reply_document(
                document=open(json_path, "rb"),
                filename=json_path.name,
            )

        # Send equity curve chart
        if png_path.exists():
            await update.message.reply_photo(
                photo=open(png_path, "rb"),
                caption=f"Equity curve: {strategy_name} ({days}d)",
            )

    except Exception as exc:
        logger.exception("Error in /backtest")
        await update.message.reply_text(f"Backtest failed: {exc}")


# ---------------------------------------------------------------------------
# Bot setup
# ---------------------------------------------------------------------------

def create_bot_application() -> Application:
    """Create and configure the Telegram bot Application."""
    token = config.TELEGRAM_TOKEN
    if not token:
        raise ValueError("TELEGRAM_TOKEN not set in .env")

    app = Application.builder().token(token).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("halt", cmd_halt))
    app.add_handler(CommandHandler("resume", cmd_resume))
    app.add_handler(CommandHandler("backtest", cmd_backtest))

    return app


def start_bot_polling(app: Application) -> None:
    """Start the Telegram bot in a background thread.

    Uses asyncio to run polling in a separate event loop so it doesn't
    block the APScheduler main loop.
    """
    def _run():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(app.initialize())
        loop.run_until_complete(app.start())
        loop.run_until_complete(app.updater.start_polling(drop_pending_updates=True))
        logger.info("[Telegram] Bot polling started")
        loop.run_forever()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return thread
