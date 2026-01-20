CREATE TABLE IF NOT EXISTS "synthetic_candles" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exchange" text DEFAULT 'sim' NOT NULL,
  "symbol" text NOT NULL,
  "timeframe" text NOT NULL,
  "ts" bigint NOT NULL,
  "open" text NOT NULL,
  "high" text NOT NULL,
  "low" text NOT NULL,
  "close" text NOT NULL,
  "volume" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "synthetic_candles_unique_idx" ON "synthetic_candles" ("exchange", "symbol", "timeframe", "ts");
CREATE INDEX IF NOT EXISTS "synthetic_candles_symbol_tf_ts_idx" ON "synthetic_candles" ("symbol", "timeframe", "ts");

CREATE TABLE IF NOT EXISTS "sim_trades" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exchange" text DEFAULT 'sim' NOT NULL,
  "symbol" text NOT NULL,
  "timeframe" text NOT NULL,
  "ts" bigint NOT NULL,
  "side" text NOT NULL,
  "qty" text NOT NULL,
  "entry_price" text NOT NULL,
  "exit_price" text NOT NULL,
  "gross_pnl_minor" text NOT NULL,
  "fees_minor" text NOT NULL,
  "net_pnl_minor" text NOT NULL,
  "hold_bars" integer NOT NULL,
  "reason" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "sim_trades_unique_idx" ON "sim_trades" ("exchange", "symbol", "timeframe", "ts");
CREATE INDEX IF NOT EXISTS "sim_trades_symbol_tf_ts_idx" ON "sim_trades" ("symbol", "timeframe", "ts");

CREATE TABLE IF NOT EXISTS "sim_positions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exchange" text DEFAULT 'sim' NOT NULL,
  "symbol" text NOT NULL,
  "timeframe" text NOT NULL,
  "ts" bigint NOT NULL,
  "side" text NOT NULL,
  "qty" text NOT NULL,
  "entry_price" text NOT NULL,
  "entry_ts" bigint NOT NULL,
  "entry_bar_index" integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "sim_positions_unique_idx" ON "sim_positions" ("exchange", "symbol", "timeframe", "ts");
CREATE INDEX IF NOT EXISTS "sim_positions_symbol_tf_ts_idx" ON "sim_positions" ("symbol", "timeframe", "ts");

CREATE TABLE IF NOT EXISTS "sim_equity_snapshots" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exchange" text DEFAULT 'sim' NOT NULL,
  "symbol" text NOT NULL,
  "timeframe" text NOT NULL,
  "ts" bigint NOT NULL,
  "equity_minor" text NOT NULL,
  "cash_minor" text NOT NULL,
  "position_value_minor" text NOT NULL,
  "drawdown_bps" integer DEFAULT 0 NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "sim_equity_snapshots_unique_idx" ON "sim_equity_snapshots" ("exchange", "symbol", "timeframe", "ts");
CREATE INDEX IF NOT EXISTS "sim_equity_snapshots_symbol_tf_ts_idx" ON "sim_equity_snapshots" ("symbol", "timeframe", "ts");

CREATE TABLE IF NOT EXISTS "benchmark_series" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exchange" text DEFAULT 'sim' NOT NULL,
  "symbol" text NOT NULL,
  "timeframe" text NOT NULL,
  "ts" bigint NOT NULL,
  "value_minor" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "benchmark_series_unique_idx" ON "benchmark_series" ("exchange", "symbol", "timeframe", "ts");
CREATE INDEX IF NOT EXISTS "benchmark_series_symbol_tf_ts_idx" ON "benchmark_series" ("symbol", "timeframe", "ts");
