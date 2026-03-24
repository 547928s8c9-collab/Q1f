"""Download OHLCV data from Bybit public API via ccxt (no API key needed).

Usage
-----
    from backtest.data_loader import download_ohlcv

    df = download_ohlcv("BTC/USDT", "4h", days=365)

Falls back to synthetic data when the network is unavailable.
"""
from __future__ import annotations

import logging
import time
from pathlib import Path

import numpy as np
import ccxt
import pandas as pd

logger = logging.getLogger(__name__)

_CACHE_DIR = Path(__file__).parent / "data"
_CACHE_DIR.mkdir(exist_ok=True)

# Bybit public — no API key required
_exchange = ccxt.bybit({"options": {"defaultType": "spot"}})

# Realistic base prices for synthetic fallback
_BASE_PRICES = {
    "BTC/USDT": 85_000.0,
    "ETH/USDT": 3_500.0,
    "SOL/USDT": 180.0,
}


def _cache_path(symbol: str, timeframe: str, days: int) -> Path:
    safe_sym = symbol.replace("/", "")
    return _CACHE_DIR / f"{safe_sym}_{timeframe}_{days}d.csv"


def _generate_synthetic(symbol: str, timeframe: str, days: int) -> pd.DataFrame:
    """Generate synthetic OHLCV data for offline/test use."""
    logger.info("Generating synthetic %s data for %d days", symbol, days)

    tf_seconds = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400}
    interval = tf_seconds.get(timeframe, 14400)
    n_candles = int(days * 86400 / interval)

    rng = np.random.default_rng(seed=abs(hash(symbol)) % (2**31))
    base = _BASE_PRICES.get(symbol, 1000.0)

    # Geometric Brownian Motion for realistic price action
    daily_vol = 0.02  # 2% daily volatility
    bar_vol = daily_vol * np.sqrt(interval / 86400)
    drift = 0.0001  # slight upward drift

    log_returns = rng.normal(drift, bar_vol, n_candles)
    prices = base * np.exp(np.cumsum(log_returns))

    now_ms = int(time.time() * 1000)
    start_ms = now_ms - days * 86400 * 1000
    timestamps = np.arange(start_ms, start_ms + n_candles * interval * 1000, interval * 1000)[:n_candles]

    high_spread = np.abs(rng.normal(0, bar_vol * 0.5, n_candles))
    low_spread = np.abs(rng.normal(0, bar_vol * 0.5, n_candles))

    df = pd.DataFrame({
        "timestamp": pd.to_datetime(timestamps, unit="ms"),
        "open": prices * (1 - rng.normal(0, 0.001, n_candles)),
        "high": prices * (1 + high_spread),
        "low": prices * (1 - low_spread),
        "close": prices,
        "volume": rng.uniform(100, 5000, n_candles),
    })

    return df


def download_ohlcv(
    symbol: str = "BTC/USDT",
    timeframe: str = "4h",
    days: int = 365,
    use_cache: bool = True,
) -> pd.DataFrame:
    """Download historical OHLCV candles from Bybit and return a DataFrame.

    Parameters
    ----------
    symbol     Trading pair, e.g. "BTC/USDT"
    timeframe  Candle interval, e.g. "1h", "4h", "1d"
    days       How many days of history to fetch
    use_cache  If True, reuse cached CSV when available

    Returns
    -------
    DataFrame with columns: timestamp, open, high, low, close, volume
    """
    cache = _cache_path(symbol, timeframe, days)

    if use_cache and cache.exists():
        logger.info("Loading cached data: %s", cache)
        df = pd.read_csv(cache)
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
        return df

    logger.info("Downloading %s %s for %d days from Bybit...", symbol, timeframe, days)

    try:
        _exchange.load_markets()
    except Exception as exc:
        logger.warning("Cannot reach Bybit: %s — using synthetic data", exc)
        return _generate_synthetic(symbol, timeframe, days)

    tf_ms = _exchange.parse_timeframe(timeframe) * 1000
    now_ms = int(time.time() * 1000)
    since_ms = now_ms - days * 24 * 60 * 60 * 1000

    all_candles: list[list] = []
    cursor = since_ms
    retries = 0

    while cursor < now_ms:
        try:
            batch = _exchange.fetch_ohlcv(
                symbol, timeframe=timeframe, since=cursor, limit=1000
            )
        except Exception as exc:
            retries += 1
            if retries > 5:
                logger.warning("Too many errors, falling back to synthetic data")
                return _generate_synthetic(symbol, timeframe, days)
            logger.warning("fetch_ohlcv error: %s — retrying in 2s", exc)
            time.sleep(2)
            continue

        if not batch:
            break

        all_candles.extend(batch)
        cursor = batch[-1][0] + tf_ms
        logger.debug("Fetched %d candles, total=%d", len(batch), len(all_candles))
        retries = 0

        # Rate limit courtesy
        time.sleep(0.3)

    if not all_candles:
        logger.warning("No data from Bybit for %s — using synthetic data", symbol)
        return _generate_synthetic(symbol, timeframe, days)

    df = pd.DataFrame(
        all_candles, columns=["timestamp", "open", "high", "low", "close", "volume"]
    )
    df.drop_duplicates(subset=["timestamp"], inplace=True)
    df.sort_values("timestamp", inplace=True)
    df.reset_index(drop=True, inplace=True)

    # Save cache (timestamps as ms integers for lossless round-trip)
    df.to_csv(cache, index=False)
    logger.info("Cached %d candles to %s", len(df), cache)

    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    return df
