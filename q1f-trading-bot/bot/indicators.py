"""Pure numpy/pandas technical indicators — drop-in replacement for ta-lib."""

import numpy as np
import pandas as pd


def RSI(close: np.ndarray, timeperiod: int = 14) -> np.ndarray:
    s = pd.Series(close)
    delta = s.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = gain.ewm(alpha=1.0 / timeperiod, min_periods=timeperiod, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / timeperiod, min_periods=timeperiod, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100.0 - 100.0 / (1.0 + rs)
    return rsi.to_numpy()


def SMA(close: np.ndarray, timeperiod: int = 30) -> np.ndarray:
    return pd.Series(close).rolling(window=timeperiod, min_periods=timeperiod).mean().to_numpy()


def EMA(close: np.ndarray, timeperiod: int = 21) -> np.ndarray:
    return pd.Series(close).ewm(span=timeperiod, min_periods=timeperiod, adjust=False).mean().to_numpy()


def BBANDS(
    close: np.ndarray,
    timeperiod: int = 20,
    nbdevup: float = 2.0,
    nbdevdn: float = 2.0,
    matype: int = 0,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    s = pd.Series(close)
    middle = s.rolling(window=timeperiod, min_periods=timeperiod).mean()
    std = s.rolling(window=timeperiod, min_periods=timeperiod).std(ddof=0)
    upper = middle + nbdevup * std
    lower = middle - nbdevdn * std
    return upper.to_numpy(), middle.to_numpy(), lower.to_numpy()


def ADX(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    timeperiod: int = 14,
) -> np.ndarray:
    h = pd.Series(high)
    l = pd.Series(low)
    c = pd.Series(close)

    plus_dm = h.diff().clip(lower=0)
    minus_dm = (-l.diff()).clip(lower=0)

    mask = plus_dm > minus_dm
    plus_dm = plus_dm.where(mask, 0.0)
    minus_dm = minus_dm.where(~mask, 0.0)

    tr1 = h - l
    tr2 = (h - c.shift(1)).abs()
    tr3 = (l - c.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    atr = tr.ewm(alpha=1.0 / timeperiod, min_periods=timeperiod, adjust=False).mean()
    plus_di = 100 * plus_dm.ewm(alpha=1.0 / timeperiod, min_periods=timeperiod, adjust=False).mean() / atr
    minus_di = 100 * minus_dm.ewm(alpha=1.0 / timeperiod, min_periods=timeperiod, adjust=False).mean() / atr

    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    adx = dx.ewm(alpha=1.0 / timeperiod, min_periods=timeperiod, adjust=False).mean()
    return adx.to_numpy()
