CREATE INDEX IF NOT EXISTS "market_candles_exchange_symbol_tf_ts_idx"
  ON "market_candles" ("exchange", "symbol", "timeframe", "ts");
