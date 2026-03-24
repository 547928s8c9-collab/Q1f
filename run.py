#!/usr/bin/env python3
"""
run.py — entry point for the q1f-trading-bot Strategy Engine (signal-only mode).

Loads the Conservative (DCA Smart) strategy, fetches market data via a mock
exchange adapter, calls generate_signal(), and prints the results.
No order execution is performed.
"""

import logging
import sys
from dataclasses import asdict
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("run")


# ── Mock exchange adapter ──────────────────────────────────────────────────────

class MockExchangeAdapter:
    """
    Stand-in exchange adapter for development / CI.

    Generates synthetic 4-H OHLCV candles that deliberately satisfy
    the Conservative strategy's BUY conditions so the signal path
    can be exercised end-to-end.

    Replace with a real CCXT-backed adapter for live trading.
    """

    _SCENARIOS: dict[str, dict[str, float]] = {
        "BTC/USDT": {
            "base_price":  65_000.0,
            "trend":        1.0,      # 1 = mild uptrend from SMA-200
            "rsi_override": 35.0,     # force oversold to trigger BUY
        },
        "ETH/USDT": {
            "base_price":   3_200.0,
            "trend":         1.0,
            "rsi_override":  72.0,    # force overbought to trigger SELL
        },
    }

    def fetch_ohlcv(
        self,
        symbol: str,
        timeframe: str = "4h",
        limit: int = 250,
    ) -> list[list[Any]]:
        import numpy as np

        rng     = np.random.default_rng(seed=abs(hash(symbol)) % (2**31))
        scenario = self._SCENARIOS.get(symbol, {"base_price": 1.0, "trend": 1.0, "rsi_override": 50.0})
        base    = scenario["base_price"]
        trend   = scenario["trend"]

        candles: list[list[Any]] = []
        ts      = 1_700_000_000_000  # fixed starting timestamp (ms)
        price   = base * 0.90        # start slightly below base

        for i in range(limit):
            ts    += 4 * 3_600_000   # +4 hours in ms
            noise  = rng.normal(0, base * 0.005)
            price  = max(price + trend * base * 0.001 + noise, base * 0.05)
            high   = price * (1 + abs(rng.normal(0, 0.003)))
            low    = price * (1 - abs(rng.normal(0, 0.003)))
            vol    = rng.uniform(500, 2_000)
            candles.append([ts, price * 0.998, high, low, price, vol])

        # Override last close so the desired RSI zone is approximated
        rsi_target = scenario["rsi_override"]
        if rsi_target < 40:
            # Push price down sharply to create oversold conditions
            last_price = candles[-1][4]
            for j in range(-10, 0):
                candles[j][4] *= 0.993   # close
                candles[j][2] *= 0.993   # high
                candles[j][3] *= 0.993   # low
        elif rsi_target > 70:
            # Push price up sharply to create overbought conditions
            for j in range(-10, 0):
                candles[j][4] *= 1.007
                candles[j][2] *= 1.007
                candles[j][3] *= 1.007

        log.debug("MockExchangeAdapter: returned %d candles for %s", len(candles), symbol)
        return candles

    def get_positions(self, strategy_id: str = "") -> list:
        return []


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    log.info("═" * 60)
    log.info("  q1f-trading-bot  │  Strategy Engine  │  signal-only mode")
    log.info("═" * 60)

    try:
        from bot.strategies.conservative import ConservativeStrategy
    except ImportError as exc:
        log.error("Could not import ConservativeStrategy: %s", exc)
        log.error("Make sure 'talib' and 'pandas' are installed.")
        sys.exit(1)

    adapter  = MockExchangeAdapter()
    strategy = ConservativeStrategy(exchange_adapter=adapter, db=None)

    log.info("Strategy loaded: %s", strategy.strategy_id)
    log.info("Parameters:\n%s", _fmt_dict(strategy.get_params()))

    log.info("─" * 60)
    log.info("Generating signals …")

    signals = strategy.generate_signal()

    if not signals:
        log.info("No signals generated.")
    else:
        log.info("Signals received: %d", len(signals))
        for sig in signals:
            _print_signal(sig)

    log.info("═" * 60)
    log.info("Done. No orders were placed (signal-only mode).")


def _print_signal(sig: Any) -> None:
    d = asdict(sig)
    border = "▶ BUY " if d["action"] == "BUY" else ("◀ SELL" if d["action"] == "SELL" else "— HOLD")
    log.info(
        "%s  %-10s  size=%.1f%%  confidence=%.2f  │ %s",
        border,
        d["symbol"],
        d["size_pct"],
        d["confidence"],
        d["reason"],
    )


def _fmt_dict(d: dict) -> str:
    return "\n".join(f"  {k}: {v}" for k, v in d.items())


if __name__ == "__main__":
    main()
