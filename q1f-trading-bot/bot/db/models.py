from dataclasses import dataclass, field
from datetime import datetime, date
from typing import Optional


@dataclass
class Strategy:
    id: str
    name: str
    status: str = "active"
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class Trade:
    strategy_id: str
    symbol: str
    side: str          # "buy" | "sell"
    amount: float
    price: float
    cost_usdt: float
    order_id: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    id: Optional[int] = None


@dataclass
class NavSnapshot:
    strategy_id: str
    nav_usdt: float
    share_price: float
    total_shares: float
    timestamp: datetime = field(default_factory=datetime.utcnow)
    id: Optional[int] = None


@dataclass
class ClientPosition:
    client_id: str
    strategy_id: str
    shares: float
    initial_deposit: float
    entry_share_price: float
    created_at: datetime = field(default_factory=datetime.utcnow)
    status: str = "active"
    id: Optional[int] = None


@dataclass
class DailyReport:
    strategy_id: str
    date: date
    nav_usdt: float
    pnl_day: float
    pnl_pct: float
    drawdown_pct: float
    trades_count: int
    id: Optional[int] = None
