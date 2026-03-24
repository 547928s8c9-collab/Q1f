import sqlite3
from contextlib import contextmanager
from typing import Generator

from bot.config import config


def get_connection() -> sqlite3.Connection:
    """Return a new SQLite connection with row_factory set."""
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def transaction() -> Generator[sqlite3.Connection, None, None]:
    """Context manager for a single atomic transaction."""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """Create all tables if they do not exist."""
    conn = get_connection()
    try:
        cursor = conn.cursor()

        cursor.executescript(
            """
            CREATE TABLE IF NOT EXISTS strategies (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                status     TEXT NOT NULL DEFAULT 'active',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS trades (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                strategy_id TEXT NOT NULL,
                symbol      TEXT NOT NULL,
                side        TEXT NOT NULL,
                amount      REAL NOT NULL,
                price       REAL NOT NULL,
                cost_usdt   REAL NOT NULL,
                order_id    TEXT NOT NULL,
                timestamp   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (strategy_id) REFERENCES strategies(id)
            );

            CREATE TABLE IF NOT EXISTS nav_snapshots (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                strategy_id  TEXT NOT NULL,
                nav_usdt     REAL NOT NULL,
                share_price  REAL NOT NULL,
                total_shares REAL NOT NULL,
                timestamp    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (strategy_id) REFERENCES strategies(id)
            );

            CREATE TABLE IF NOT EXISTS client_positions (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id         TEXT NOT NULL,
                strategy_id       TEXT NOT NULL,
                shares            REAL NOT NULL,
                initial_deposit   REAL NOT NULL,
                entry_share_price REAL NOT NULL,
                created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                status            TEXT NOT NULL DEFAULT 'active',
                FOREIGN KEY (strategy_id) REFERENCES strategies(id)
            );

            CREATE TABLE IF NOT EXISTS daily_reports (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                strategy_id  TEXT NOT NULL,
                date         DATE NOT NULL,
                nav_usdt     REAL NOT NULL,
                pnl_day      REAL NOT NULL,
                pnl_pct      REAL NOT NULL,
                drawdown_pct REAL NOT NULL,
                trades_count INTEGER NOT NULL,
                FOREIGN KEY (strategy_id) REFERENCES strategies(id)
            );
            """
        )
        conn.commit()
        print("[DB] Tables initialised.")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def insert_trade(
    strategy_id: str,
    symbol: str,
    side: str,
    amount: float,
    price: float,
    cost_usdt: float,
    order_id: str,
) -> int:
    """Insert a trade record and return the new row id."""
    with transaction() as conn:
        cursor = conn.execute(
            """
            INSERT INTO trades (strategy_id, symbol, side, amount, price, cost_usdt, order_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (strategy_id, symbol, side, amount, price, cost_usdt, order_id),
        )
        return cursor.lastrowid


def ensure_strategy(strategy_id: str, name: str) -> None:
    """Insert strategy if it doesn't exist yet (upsert-safe)."""
    with transaction() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO strategies (id, name) VALUES (?, ?)",
            (strategy_id, name),
        )
