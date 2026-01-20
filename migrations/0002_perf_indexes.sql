CREATE INDEX IF NOT EXISTS "market_candles_exchange_symbol_tf_ts_idx"
  ON "market_candles" ("exchange", "symbol", "timeframe", "ts");

CREATE INDEX IF NOT EXISTS "sim_equity_snapshots_strategy_id_idx"
  ON "sim_equity_snapshots" ("strategy_id");
