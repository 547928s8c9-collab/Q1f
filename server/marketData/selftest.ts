import { loadCandles } from "./loadCandles";
import { storage } from "../storage";

async function selftest() {
  console.log("=== Market Data Selftest ===\n");
  
  const symbol = "BTCUSDT";
  const timeframe = "15m";
  const now = Date.now();
  const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
  
  console.log(`Testing: ${symbol} ${timeframe}`);
  console.log(`Range: ${new Date(twoDaysAgo).toISOString()} to ${new Date(now).toISOString()}\n`);
  
  let passed = true;
  
  console.log("--- First call (may fetch from Binance) ---");
  const start1 = Date.now();
  const result1 = await loadCandles({
    symbol,
    timeframe,
    startMs: twoDaysAgo,
    endMs: now,
  });
  const elapsed1 = Date.now() - start1;
  
  console.log(`Source: ${result1.source}`);
  console.log(`Candles: ${result1.candles.length}`);
  console.log(`Gaps: ${result1.gaps.length}`);
  console.log(`Time: ${elapsed1}ms\n`);
  
  if (result1.candles.length === 0) {
    console.error("FAIL: No candles returned on first call");
    passed = false;
  }
  
  const sorted1 = [...result1.candles].sort((a, b) => a.ts - b.ts);
  const isSorted1 = result1.candles.every((c, i) => c.ts === sorted1[i].ts);
  if (!isSorted1) {
    console.error("FAIL: Candles not sorted ASC by ts");
    passed = false;
  } else {
    console.log("PASS: Candles sorted ASC by ts");
  }
  
  const tsSet1 = new Set(result1.candles.map(c => c.ts));
  if (tsSet1.size !== result1.candles.length) {
    console.error(`FAIL: Duplicate timestamps in response (${result1.candles.length} candles, ${tsSet1.size} unique)`);
    passed = false;
  } else {
    console.log("PASS: No duplicate timestamps in response\n");
  }
  
  console.log("--- Second call (should be cached) ---");
  const start2 = Date.now();
  const result2 = await loadCandles({
    symbol,
    timeframe,
    startMs: twoDaysAgo,
    endMs: now,
  });
  const elapsed2 = Date.now() - start2;
  
  console.log(`Source: ${result2.source}`);
  console.log(`Candles: ${result2.candles.length}`);
  console.log(`Time: ${elapsed2}ms\n`);
  
  if (result2.source !== "cache") {
    console.warn("WARN: Second call used network (expected cache)");
  } else {
    console.log("PASS: Second call served from cache");
  }
  
  if (result2.candles.length !== result1.candles.length) {
    console.error(`FAIL: Candle count mismatch (${result1.candles.length} vs ${result2.candles.length})`);
    passed = false;
  } else {
    console.log("PASS: Candle count matches between calls\n");
  }
  
  console.log("--- Checking DB for duplicates ---");
  const dbCandles = await storage.getCandlesFromCache("binance_spot", symbol, timeframe, twoDaysAgo, now);
  const dbTsSet = new Set(dbCandles.map(c => c.ts));
  if (dbTsSet.size !== dbCandles.length) {
    console.error(`FAIL: Duplicate timestamps in DB (${dbCandles.length} rows, ${dbTsSet.size} unique)`);
    passed = false;
  } else {
    console.log(`PASS: No duplicates in DB (${dbCandles.length} unique candles)\n`);
  }
  
  console.log("--- Testing symbol normalization ---");
  const result3 = await loadCandles({
    symbol: "BTC/USDT",
    timeframe: "15m",
    startMs: now - 60 * 60 * 1000,
    endMs: now,
  });
  if (result3.candles.length > 0) {
    console.log("PASS: BTC/USDT normalized to BTCUSDT correctly\n");
  } else {
    console.error("FAIL: Symbol normalization failed\n");
    passed = false;
  }
  
  console.log("=== Selftest Complete ===");
  console.log(passed ? "RESULT: ALL TESTS PASSED" : "RESULT: SOME TESTS FAILED");
  
  process.exit(passed ? 0 : 1);
}

selftest().catch((err) => {
  console.error("Selftest error:", err);
  process.exit(1);
});
