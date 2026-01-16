import { loadCandles } from "./loadCandles";
import { storage } from "../storage";
import { normalizeSymbol, normalizeTimeframe, isValidTimeframe, timeframeToMs } from "./utils";

async function selftest() {
  console.log("=== Market Data Selftest (CryptoCompare) ===\n");
  
  let passed = true;
  
  console.log("--- Testing normalization utils ---");
  
  const tests: Array<[string, () => boolean]> = [
    ["normalizeSymbol('BTC/USDT') = 'BTCUSDT'", () => normalizeSymbol("BTC/USDT") === "BTCUSDT"],
    ["normalizeSymbol('eth-usdt') = 'ETHUSDT'", () => normalizeSymbol("eth-usdt") === "ETHUSDT"],
    ["normalizeTimeframe('1h') = '1h'", () => normalizeTimeframe("1h") === "1h"],
    ["normalizeTimeframe('15m') = '15m'", () => normalizeTimeframe("15m") === "15m"],
    ["normalizeTimeframe('1d') = '1d'", () => normalizeTimeframe("1d") === "1d"],
    ["isValidTimeframe('1h') = true", () => isValidTimeframe("1h") === true],
    ["isValidTimeframe('2h') = false", () => isValidTimeframe("2h") === false],
    ["timeframeToMs('15m') = 900000", () => timeframeToMs("15m") === 900000],
    ["timeframeToMs('1h') = 3600000", () => timeframeToMs("1h") === 3600000],
  ];
  
  for (const [name, test] of tests) {
    try {
      if (test()) {
        console.log(`PASS: ${name}`);
      } else {
        console.error(`FAIL: ${name}`);
        passed = false;
      }
    } catch (e) {
      console.error(`FAIL: ${name} - threw error: ${e}`);
      passed = false;
    }
  }
  console.log();
  
  const symbol = "BTCUSDT";
  const timeframe = "1h";
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  
  console.log(`--- Testing loadCandles for ${symbol} ${timeframe} ---`);
  console.log(`Range: ${new Date(oneDayAgo).toISOString()} to ${new Date(now).toISOString()}\n`);
  
  console.log("First call (fetching from CryptoCompare)...");
  const start1 = Date.now();
  const result1 = await loadCandles({
    symbol,
    timeframe,
    startMs: oneDayAgo,
    endMs: now,
  });
  const elapsed1 = Date.now() - start1;
  
  console.log(`Source: ${result1.source}`);
  console.log(`Candles: ${result1.candles.length}`);
  console.log(`Gaps: ${result1.gaps.length}`);
  console.log(`Time: ${elapsed1}ms\n`);
  
  if (result1.candles.length === 0) {
    console.error("FAIL: No candles returned on first call");
    console.log("  This might indicate API rate limiting or network issues");
    passed = false;
  } else {
    console.log("PASS: Candles received from CryptoCompare");
    
    const sorted1 = [...result1.candles].sort((a, b) => a.ts - b.ts);
    const isSorted1 = result1.candles.every((c, i) => c.ts === sorted1[i].ts);
    if (isSorted1) {
      console.log("PASS: Candles sorted ASC by ts");
    } else {
      console.error("FAIL: Candles not sorted ASC by ts");
      passed = false;
    }
    
    const tsSet1 = new Set(result1.candles.map(c => c.ts));
    if (tsSet1.size === result1.candles.length) {
      console.log("PASS: No duplicate timestamps in response");
    } else {
      console.error(`FAIL: Duplicate timestamps in response (${result1.candles.length} candles, ${tsSet1.size} unique)`);
      passed = false;
    }
    
    const firstCandle = result1.candles[0];
    if (firstCandle.open > 0 && firstCandle.close > 0 && firstCandle.volume >= 0) {
      console.log("PASS: Candle data looks valid (open/close/volume present)");
    } else {
      console.error("FAIL: Candle data appears invalid");
      passed = false;
    }
  }
  console.log();
  
  console.log("Second call (should be cached)...");
  const start2 = Date.now();
  const result2 = await loadCandles({
    symbol,
    timeframe,
    startMs: oneDayAgo,
    endMs: now,
  });
  const elapsed2 = Date.now() - start2;
  
  console.log(`Source: ${result2.source}`);
  console.log(`Candles: ${result2.candles.length}`);
  console.log(`Time: ${elapsed2}ms\n`);
  
  if (result2.source === "cache") {
    console.log("PASS: Second call served from cache");
  } else {
    console.warn("WARN: Second call used network (expected cache)");
  }
  
  if (result2.candles.length === result1.candles.length) {
    console.log("PASS: Candle count matches between calls");
  } else {
    console.error(`FAIL: Candle count mismatch (${result1.candles.length} vs ${result2.candles.length})`);
    passed = false;
  }
  
  console.log("\n--- Checking DB for duplicates ---");
  const dbCandles = await storage.getCandlesFromCache("cryptocompare", symbol, timeframe, oneDayAgo, now);
  const dbTsSet = new Set(dbCandles.map(c => c.ts));
  if (dbTsSet.size === dbCandles.length) {
    console.log(`PASS: No duplicates in DB (${dbCandles.length} unique candles)`);
  } else {
    console.error(`FAIL: Duplicate timestamps in DB (${dbCandles.length} rows, ${dbTsSet.size} unique)`);
    passed = false;
  }
  
  console.log("\n=== Selftest Complete ===");
  console.log(passed ? "RESULT: ALL TESTS PASSED" : "RESULT: SOME TESTS FAILED");
  
  process.exit(passed ? 0 : 1);
}

selftest().catch((err) => {
  console.error("Selftest error:", err);
  process.exit(1);
});
