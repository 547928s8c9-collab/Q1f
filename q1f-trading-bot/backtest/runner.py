#!/usr/bin/env python3
"""Backtest engine for q1f-trading-bot strategies.

Emulates trading on historical OHLCV data using the same strategy logic,
RiskManager and CircuitBreaker as the live bot.

CLI
---
    python -m backtest.runner --strategy conservative --days 365 --capital 10000
    python -m backtest.runner --strategy balanced     --days 365 --capital 10000
    python -m backtest.runner --strategy aggressive   --days 365 --capital 10000
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

# Ensure package root is importable when running with -m
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backtest.data_loader import download_ohlcv

logger = logging.getLogger(__name__)

RESULTS_DIR = Path(__file__).parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)


# ---------------------------------------------------------------------------
# Virtual trade record
# ---------------------------------------------------------------------------

@dataclass
class VirtualTrade:
    timestamp: datetime
    symbol: str
    side: str          # "buy" | "sell"
    amount: float      # asset qty
    price: float       # fill price
    cost_usdt: float   # amount * price
    reason: str = ""


# ---------------------------------------------------------------------------
# Risk Manager (same logic as live bot)
# ---------------------------------------------------------------------------

class RiskManager:
    """Position-level risk controls used in both live and backtest."""

    def __init__(
        self,
        max_position_pct: float = 25.0,
        max_drawdown_pct: float = 20.0,
        max_daily_loss_pct: float = 5.0,
    ) -> None:
        self.max_position_pct = max_position_pct
        self.max_drawdown_pct = max_drawdown_pct
        self.max_daily_loss_pct = max_daily_loss_pct

    def check_position_size(self, size_pct: float, nav: float) -> float:
        """Clamp position size to max_position_pct of NAV."""
        capped = min(size_pct, self.max_position_pct)
        return capped

    def check_drawdown(self, current_nav: float, hwm: float) -> bool:
        """Return True if drawdown breaches limit (should halt)."""
        if hwm <= 0:
            return False
        dd_pct = (hwm - current_nav) / hwm * 100
        return dd_pct >= self.max_drawdown_pct

    def check_daily_loss(self, nav_start_of_day: float, current_nav: float) -> bool:
        """Return True if daily loss breaches limit."""
        if nav_start_of_day <= 0:
            return False
        loss_pct = (nav_start_of_day - current_nav) / nav_start_of_day * 100
        return loss_pct >= self.max_daily_loss_pct


# ---------------------------------------------------------------------------
# Circuit Breaker
# ---------------------------------------------------------------------------

class CircuitBreaker:
    """Halts trading when risk limits are breached."""

    def __init__(self) -> None:
        self.tripped = False
        self.reason: str = ""

    def trip(self, reason: str) -> None:
        self.tripped = True
        self.reason = reason
        logger.warning("[CircuitBreaker] TRIPPED: %s", reason)

    def reset(self) -> None:
        self.tripped = False
        self.reason = ""

    @property
    def is_halted(self) -> bool:
        return self.tripped


# ---------------------------------------------------------------------------
# Mock exchange adapter for backtest
# ---------------------------------------------------------------------------

class BacktestExchangeAdapter:
    """Feeds historical candles to strategy.generate_signal() during backtest."""

    def __init__(self, ohlcv_data: dict[str, pd.DataFrame]) -> None:
        """
        Parameters
        ----------
        ohlcv_data  Mapping of symbol -> full DataFrame of OHLCV candles
        """
        self._data = ohlcv_data
        self._cursor: int = 0   # current bar index

    def set_cursor(self, idx: int) -> None:
        self._cursor = idx

    def fetch_ohlcv(
        self, symbol: str, timeframe: str = "4h", limit: int = 250
    ) -> list[list[Any]]:
        df = self._data.get(symbol)
        if df is None:
            return []
        end = self._cursor + 1
        start = max(0, end - limit)
        chunk = df.iloc[start:end]
        rows: list[list[Any]] = []
        for _, r in chunk.iterrows():
            ts = int(r["timestamp"].timestamp() * 1000) if hasattr(r["timestamp"], "timestamp") else int(r["timestamp"])
            rows.append([ts, r["open"], r["high"], r["low"], r["close"], r["volume"]])
        return rows

    def fetch_ticker(self, symbol: str) -> dict:
        df = self._data.get(symbol)
        if df is None:
            return {"last": 0.0}
        idx = min(self._cursor, len(df) - 1)
        price = float(df.iloc[idx]["close"])
        return {"last": price, "bid": price * 0.999, "ask": price * 1.001}

    def get_positions(self, strategy_id: str = "") -> list:
        return []


# ---------------------------------------------------------------------------
# Backtest Engine
# ---------------------------------------------------------------------------

@dataclass
class BacktestResult:
    strategy: str
    days: int
    initial_capital: float
    final_capital: float
    total_return_pct: float
    annualized_return_pct: float
    max_drawdown_pct: float
    sharpe_ratio: float
    win_rate_pct: float
    avg_win: float
    avg_loss: float
    total_trades: int
    monthly_breakdown: list[dict]
    equity_curve: list[dict] = field(default_factory=list)
    trades: list[dict] = field(default_factory=list)
    circuit_breaker_trips: int = 0


class BacktestEngine:
    """Runs a strategy over historical data with virtual order execution."""

    def __init__(
        self,
        strategy_name: str,
        initial_capital: float = 10_000.0,
        risk_manager: RiskManager | None = None,
        circuit_breaker: CircuitBreaker | None = None,
    ) -> None:
        self.strategy_name = strategy_name
        self.initial_capital = initial_capital
        self.risk_manager = risk_manager or RiskManager()
        self.circuit_breaker = circuit_breaker or CircuitBreaker()

        self.cash: float = initial_capital
        self.positions: dict[str, float] = {}   # symbol -> qty
        self.trades: list[VirtualTrade] = []
        self.equity_curve: list[dict] = []       # [{timestamp, equity}]
        self.hwm: float = initial_capital
        self.nav_start_of_day: float = initial_capital
        self._current_day: str = ""
        self.cb_trips: int = 0

    # ------------------------------------------------------------------
    # NAV
    # ------------------------------------------------------------------

    def _nav(self, prices: dict[str, float]) -> float:
        """Calculate current portfolio NAV."""
        nav = self.cash
        for sym, qty in self.positions.items():
            nav += qty * prices.get(sym, 0.0)
        return nav

    # ------------------------------------------------------------------
    # Execute virtual trade
    # ------------------------------------------------------------------

    def execute_signal(
        self,
        signal: Any,
        prices: dict[str, float],
        timestamp: datetime,
    ) -> VirtualTrade | None:
        """Execute a signal as a virtual trade (no real exchange call)."""
        from bot.strategies.base import Action

        if signal.action == Action.HOLD:
            return None

        if self.circuit_breaker.is_halted:
            return None

        nav = self._nav(prices)
        price = prices.get(signal.symbol, 0.0)
        if price <= 0 or nav <= 0:
            return None

        # Risk check: clamp size
        capped_pct = self.risk_manager.check_position_size(signal.size_pct, nav)
        notional = nav * (capped_pct / 100.0)

        side = "buy" if signal.action == Action.BUY else "sell"

        if side == "buy":
            notional = min(notional, self.cash)
            if notional < 1.0:
                return None
            amount = notional / price
            self.cash -= notional
            self.positions[signal.symbol] = self.positions.get(signal.symbol, 0.0) + amount
        else:
            held = self.positions.get(signal.symbol, 0.0)
            if held <= 0:
                return None
            sell_pct = capped_pct / 100.0 if capped_pct <= 100 else 1.0
            # For SELL signals, size_pct means % of position to sell
            sell_pct = min(signal.size_pct / 100.0, 1.0)
            amount = held * sell_pct
            self.cash += amount * price
            self.positions[signal.symbol] = held - amount

        trade = VirtualTrade(
            timestamp=timestamp,
            symbol=signal.symbol,
            side=side,
            amount=round(amount, 8),
            price=round(price, 2),
            cost_usdt=round(amount * price, 2),
            reason=signal.reason,
        )
        self.trades.append(trade)
        return trade

    # ------------------------------------------------------------------
    # Risk checks per bar
    # ------------------------------------------------------------------

    def _check_risk(self, nav: float, timestamp: datetime) -> None:
        day_str = str(timestamp.date()) if hasattr(timestamp, "date") else ""

        # Reset daily tracking
        if day_str != self._current_day:
            self._current_day = day_str
            self.nav_start_of_day = nav
            # Auto-reset circuit breaker on new day
            if self.circuit_breaker.is_halted:
                self.circuit_breaker.reset()

        # Update HWM
        if nav > self.hwm:
            self.hwm = nav

        # Check drawdown
        if self.risk_manager.check_drawdown(nav, self.hwm):
            self.circuit_breaker.trip(
                f"Max drawdown breached: {(self.hwm - nav) / self.hwm * 100:.1f}%"
            )
            self.cb_trips += 1

        # Check daily loss
        if self.risk_manager.check_daily_loss(self.nav_start_of_day, nav):
            self.circuit_breaker.trip(
                f"Daily loss breached: {(self.nav_start_of_day - nav) / self.nav_start_of_day * 100:.1f}%"
            )
            self.cb_trips += 1

    # ------------------------------------------------------------------
    # Run backtest
    # ------------------------------------------------------------------

    def run(
        self,
        strategy: Any,
        ohlcv_data: dict[str, pd.DataFrame],
        adapter: BacktestExchangeAdapter,
    ) -> BacktestResult:
        """Walk-forward bar-by-bar backtest.

        Uses the primary symbol's DataFrame as the time axis.
        """
        # Determine primary symbol for iteration
        primary_sym = list(ohlcv_data.keys())[0]
        df_main = ohlcv_data[primary_sym]
        n_bars = len(df_main)

        # Minimum bars needed (SMA-200 + buffer)
        start_bar = 250

        logger.info(
            "Starting backtest: strategy=%s  bars=%d  start_bar=%d  capital=%.0f",
            self.strategy_name, n_bars, start_bar, self.initial_capital,
        )

        for i in range(start_bar, n_bars):
            adapter.set_cursor(i)

            # Current prices
            prices: dict[str, float] = {}
            for sym, df in ohlcv_data.items():
                if i < len(df):
                    prices[sym] = float(df.iloc[i]["close"])

            ts = df_main.iloc[i]["timestamp"]
            nav = self._nav(prices)

            # Risk check
            self._check_risk(nav, ts)

            # Generate signals
            try:
                signals = strategy.generate_signal()
            except Exception as exc:
                logger.debug("Signal error at bar %d: %s", i, exc)
                signals = []

            for sig in signals:
                self.execute_signal(sig, prices, ts)

            # Record equity
            nav_after = self._nav(prices)
            self.equity_curve.append({
                "timestamp": str(ts),
                "equity": round(nav_after, 2),
            })

        # Final NAV
        final_prices: dict[str, float] = {}
        for sym, df in ohlcv_data.items():
            final_prices[sym] = float(df.iloc[-1]["close"])
        final_nav = self._nav(final_prices)

        return self._compute_metrics(final_nav, ohlcv_data)

    # ------------------------------------------------------------------
    # Metrics
    # ------------------------------------------------------------------

    def _compute_metrics(
        self, final_nav: float, ohlcv_data: dict[str, pd.DataFrame]
    ) -> BacktestResult:
        total_return = (final_nav - self.initial_capital) / self.initial_capital * 100

        # Annualized return
        n_days = len(self.equity_curve) * 4 / 24  # 4h bars -> days approx
        if n_days > 0:
            ann_return = ((final_nav / self.initial_capital) ** (365 / max(n_days, 1)) - 1) * 100
        else:
            ann_return = 0.0

        # Max drawdown from equity curve
        equities = [e["equity"] for e in self.equity_curve]
        max_dd = 0.0
        peak = self.initial_capital
        for eq in equities:
            if eq > peak:
                peak = eq
            dd = (peak - eq) / peak * 100 if peak > 0 else 0
            max_dd = max(max_dd, dd)

        # Sharpe ratio (rf=0, using daily returns)
        sharpe = 0.0
        if len(equities) > 1:
            eq_arr = np.array(equities)
            returns = np.diff(eq_arr) / eq_arr[:-1]
            # Group into daily returns (6 bars per day for 4h)
            bars_per_day = 6
            daily_returns = []
            for d in range(0, len(returns), bars_per_day):
                chunk = returns[d:d + bars_per_day]
                daily_returns.append(np.prod(1 + chunk) - 1)
            daily_returns = np.array(daily_returns)
            if len(daily_returns) > 1 and np.std(daily_returns) > 0:
                sharpe = float(np.mean(daily_returns) / np.std(daily_returns) * np.sqrt(365))

        # Win rate, avg win/loss
        trade_pnls: list[float] = []
        # Pair up buy/sell trades per symbol
        buys: dict[str, list[VirtualTrade]] = {}
        for t in self.trades:
            if t.side == "buy":
                buys.setdefault(t.symbol, []).append(t)
            elif t.side == "sell" and buys.get(t.symbol):
                entry = buys[t.symbol].pop(0)
                pnl = (t.price - entry.price) * t.amount
                trade_pnls.append(pnl)

        wins = [p for p in trade_pnls if p > 0]
        losses = [p for p in trade_pnls if p <= 0]
        win_rate = len(wins) / len(trade_pnls) * 100 if trade_pnls else 0.0
        avg_win = float(np.mean(wins)) if wins else 0.0
        avg_loss = float(np.mean(losses)) if losses else 0.0

        # Monthly breakdown
        monthly: list[dict] = []
        if self.equity_curve:
            eq_df = pd.DataFrame(self.equity_curve)
            eq_df["timestamp"] = pd.to_datetime(eq_df["timestamp"])
            eq_df["month"] = eq_df["timestamp"].dt.to_period("M")
            for month, grp in eq_df.groupby("month"):
                start_eq = grp.iloc[0]["equity"]
                end_eq = grp.iloc[-1]["equity"]
                ret = (end_eq - start_eq) / start_eq * 100 if start_eq > 0 else 0
                monthly.append({
                    "month": str(month),
                    "start_equity": round(start_eq, 2),
                    "end_equity": round(end_eq, 2),
                    "return_pct": round(ret, 2),
                })

        return BacktestResult(
            strategy=self.strategy_name,
            days=int(len(self.equity_curve) * 4 / 24),
            initial_capital=self.initial_capital,
            final_capital=round(final_nav, 2),
            total_return_pct=round(total_return, 2),
            annualized_return_pct=round(ann_return, 2),
            max_drawdown_pct=round(max_dd, 2),
            sharpe_ratio=round(sharpe, 4),
            win_rate_pct=round(win_rate, 2),
            avg_win=round(avg_win, 2),
            avg_loss=round(avg_loss, 2),
            total_trades=len(self.trades),
            monthly_breakdown=monthly,
            equity_curve=[{"timestamp": e["timestamp"], "equity": e["equity"]} for e in self.equity_curve],
            trades=[{
                "timestamp": str(t.timestamp),
                "symbol": t.symbol,
                "side": t.side,
                "amount": t.amount,
                "price": t.price,
                "cost_usdt": t.cost_usdt,
                "reason": t.reason,
            } for t in self.trades],
            circuit_breaker_trips=self.cb_trips,
        )


# ---------------------------------------------------------------------------
# Strategy factory
# ---------------------------------------------------------------------------

STRATEGY_MAP = {
    "conservative": ("conservative_dca", "Conservative DCA"),
    "balanced":     ("balanced_v1", "Balanced"),
    "aggressive":   ("aggressive_v1", "Aggressive"),
}


def _build_strategy(name: str, adapter: BacktestExchangeAdapter) -> Any:
    """Instantiate the right strategy object."""
    from bot.strategies.conservative import ConservativeStrategy
    from bot.strategies.balanced import BalancedStrategy
    from bot.strategies.aggressive import AggressiveStrategy

    mapping = {
        "conservative": ConservativeStrategy,
        "balanced": BalancedStrategy,
        "aggressive": AggressiveStrategy,
    }
    cls = mapping.get(name)
    if cls is None:
        raise ValueError(f"Unknown strategy: {name!r}. Choose from: {list(mapping)}")
    return cls(exchange_adapter=adapter, db=None)


def _get_symbols_for_strategy(name: str) -> list[str]:
    """Return the symbols a strategy trades."""
    if name == "conservative":
        return ["BTC/USDT", "ETH/USDT"]
    elif name == "balanced":
        return ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
    elif name == "aggressive":
        return ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
    return ["BTC/USDT"]


# ---------------------------------------------------------------------------
# Chart generation
# ---------------------------------------------------------------------------

def generate_equity_chart(result: BacktestResult, output_path: Path) -> Path:
    """Save an equity curve PNG chart and return the path."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates

    timestamps = pd.to_datetime([e["timestamp"] for e in result.equity_curve])
    equities = [e["equity"] for e in result.equity_curve]

    fig, ax = plt.subplots(figsize=(14, 6))
    ax.plot(timestamps, equities, linewidth=1.2, color="#2196F3")
    ax.axhline(y=result.initial_capital, color="gray", linestyle="--", alpha=0.5, label="Initial capital")
    ax.fill_between(timestamps, result.initial_capital, equities, alpha=0.1, color="#2196F3")

    ax.set_title(
        f"Backtest: {result.strategy}  |  "
        f"Return: {result.total_return_pct:+.1f}%  |  "
        f"Max DD: {result.max_drawdown_pct:.1f}%  |  "
        f"Sharpe: {result.sharpe_ratio:.2f}",
        fontsize=12,
    )
    ax.set_xlabel("Date")
    ax.set_ylabel("Equity (USDT)")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
    ax.xaxis.set_major_locator(mdates.MonthLocator())
    fig.autofmt_xdate()
    ax.legend()
    ax.grid(True, alpha=0.3)

    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)

    logger.info("Equity chart saved: %s", output_path)
    return output_path


# ---------------------------------------------------------------------------
# Public API — run_backtest
# ---------------------------------------------------------------------------

def run_backtest(
    strategy_name: str = "conservative",
    days: int = 365,
    capital: float = 10_000.0,
) -> tuple[BacktestResult, Path, Path]:
    """Run a full backtest and return (result, json_path, png_path).

    This is the main entry point used by both CLI and Telegram /backtest.
    """
    symbols = _get_symbols_for_strategy(strategy_name)

    # Download data
    ohlcv_data: dict[str, pd.DataFrame] = {}
    for sym in symbols:
        ohlcv_data[sym] = download_ohlcv(sym, "4h", days)

    # Build adapter & strategy
    adapter = BacktestExchangeAdapter(ohlcv_data)
    strategy = _build_strategy(strategy_name, adapter)

    # Build engine with risk controls
    engine = BacktestEngine(
        strategy_name=strategy_name,
        initial_capital=capital,
        risk_manager=RiskManager(),
        circuit_breaker=CircuitBreaker(),
    )

    # Run
    result = engine.run(strategy, ohlcv_data, adapter)

    # Save results
    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    json_path = RESULTS_DIR / f"{strategy_name}_{ts}.json"
    png_path = RESULTS_DIR / f"{strategy_name}_{ts}.png"

    # JSON summary (without full equity curve for readability)
    summary = asdict(result)
    summary.pop("equity_curve", None)  # too large for summary
    with open(json_path, "w") as f:
        json.dump(summary, f, indent=2, default=str)
    logger.info("Results saved: %s", json_path)

    # Chart
    if result.equity_curve:
        generate_equity_chart(result, png_path)

    return result, json_path, png_path


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    )

    parser = argparse.ArgumentParser(description="Q1F Backtest Runner")
    parser.add_argument(
        "--strategy", default="conservative",
        choices=["conservative", "balanced", "aggressive"],
        help="Strategy to backtest",
    )
    parser.add_argument("--days", type=int, default=365, help="Days of history")
    parser.add_argument("--capital", type=float, default=10_000.0, help="Initial capital (USDT)")
    args = parser.parse_args()

    print(f"\n{'='*60}")
    print(f"  Q1F Backtest Runner")
    print(f"  Strategy : {args.strategy}")
    print(f"  Days     : {args.days}")
    print(f"  Capital  : {args.capital:,.0f} USDT")
    print(f"{'='*60}\n")

    result, json_path, png_path = run_backtest(args.strategy, args.days, args.capital)

    print(f"\n{'='*60}")
    print(f"  RESULTS")
    print(f"{'='*60}")
    print(f"  Final Capital       : {result.final_capital:>12,.2f} USDT")
    print(f"  Total Return        : {result.total_return_pct:>+12.2f} %")
    print(f"  Annualized Return   : {result.annualized_return_pct:>+12.2f} %")
    print(f"  Max Drawdown        : {result.max_drawdown_pct:>12.2f} %")
    print(f"  Sharpe Ratio        : {result.sharpe_ratio:>12.4f}")
    print(f"  Win Rate            : {result.win_rate_pct:>12.2f} %")
    print(f"  Avg Win             : {result.avg_win:>+12.2f} USDT")
    print(f"  Avg Loss            : {result.avg_loss:>+12.2f} USDT")
    print(f"  Total Trades        : {result.total_trades:>12d}")
    print(f"  Circuit Breaker Trips: {result.circuit_breaker_trips:>11d}")

    if result.monthly_breakdown:
        print(f"\n  Monthly Breakdown:")
        for m in result.monthly_breakdown:
            print(f"    {m['month']}  return={m['return_pct']:+.2f}%  equity={m['end_equity']:,.2f}")

    print(f"\n  JSON : {json_path}")
    print(f"  Chart: {png_path}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
