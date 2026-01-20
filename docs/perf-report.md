# Performance & Scalability Pass (Overnight)

## Scope
- Candle endpoints (`/api/market/candles`, `/api/invest/strategies/:id/candles`)
- Invest pages (`/invest`, `/invest/:id`)

## Methodology
### Candle payload sizing (synthetic measurement)
Measured JSON payload size using a synthetic 6-field candle object to approximate API response size.
Command used:

```bash
node -e "const make=(n)=>Array.from({length:n},(_,i)=>({ts:1700000000000+i*900000,open:100.12,high:101.34,low:99.88,close:100.5,volume:1234.56}));const sizes=[8640,2160,90];sizes.forEach(n=>{const data=make(n);const json=JSON.stringify({candles:data});console.log(n, (Buffer.byteLength(json)/1024).toFixed(1)+'KB');});"
```

Results:
- 90D @ 15m (8640 candles): **~776.3KB**
- 90D downsampled to 1h (2160 candles): **~194.1KB**
- 90D downsampled to 1d (90 candles): **~8.1KB**

### Invest page render frequency (manual profiling)
Use React DevTools Profiler with:
1. Open `/invest/:id`.
2. Toggle period (7D → 30D → 90D).
3. Record commit counts for `StrategyDetail` and `CandlestickChart`.

**NOTE:** This environment does not run the UI, so render counts are not captured here. Use the steps above to validate reductions from stable query keys + memoized data.

## Before → After (Key Changes)
### Candle endpoints
**Before**
- Long ranges returned full requested timeframe payload (e.g., 90D @ 15m ≈ 776KB).

**After**
- Downsampling to keep bar counts under 3.5k for invest views and 5k for market endpoints.
- 90D @ 15m now returns 1h candles (~194KB synthetic size estimate).

### Invest pages
**Before**
- Query keys and derived arrays re-created on render, increasing component churn.

**After**
- Memoized query keys + derived datasets, plus cached server responses to reduce re-render triggers.

## Patch Highlights
- Server-side cache keyed by user/strategy/period/timeframe for candles + insights.
- Downsampling aggregation for large ranges with explicit `requestedTimeframe`/`effectiveTimeframe`.
- Rate limiting on invest candles/insights endpoints.
- Added DB indexes for candle and equity snapshot access paths.

## Follow-up Verification Checklist
- Confirm `/api/invest/strategies/:id/candles` response includes `requestedTimeframe` and `effectiveTimeframe`.
- React Profiler: fewer renders on period/timeframe changes.
- Inspect payload size via browser network panel before/after downsampling thresholds.
