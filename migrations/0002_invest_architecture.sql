ALTER TABLE "strategy_profiles" ADD COLUMN IF NOT EXISTS "pairs_json" jsonb;
ALTER TABLE "strategy_profiles" ADD COLUMN IF NOT EXISTS "benchmarks_json" jsonb;
ALTER TABLE "strategy_profiles" ADD COLUMN IF NOT EXISTS "expected_return_min_bps" integer;
ALTER TABLE "strategy_profiles" ADD COLUMN IF NOT EXISTS "expected_return_max_bps" integer;

ALTER TABLE "sim_positions" ADD COLUMN IF NOT EXISTS "user_id" varchar REFERENCES "users"("id");
DROP INDEX IF EXISTS "sim_positions_strategy_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "sim_positions_user_strategy_idx" ON "sim_positions" ("user_id", "strategy_id");

ALTER TABLE "sim_trades" ADD COLUMN IF NOT EXISTS "user_id" varchar REFERENCES "users"("id");
ALTER TABLE "sim_trades" ADD COLUMN IF NOT EXISTS "symbol" text;
ALTER TABLE "sim_trades" ADD COLUMN IF NOT EXISTS "side" text DEFAULT 'LONG';
DROP INDEX IF EXISTS "sim_trades_strategy_entry_idx";
DROP INDEX IF EXISTS "sim_trades_strategy_status_idx";
CREATE INDEX IF NOT EXISTS "sim_trades_user_strategy_entry_idx" ON "sim_trades" ("user_id", "strategy_id", "entry_ts");
CREATE INDEX IF NOT EXISTS "sim_trades_user_strategy_status_idx" ON "sim_trades" ("user_id", "strategy_id", "status");

ALTER TABLE "sim_equity_snapshots" ADD COLUMN IF NOT EXISTS "user_id" varchar REFERENCES "users"("id");
ALTER TABLE "sim_equity_snapshots" ADD COLUMN IF NOT EXISTS "allocated_minor" text DEFAULT '0';
ALTER TABLE "sim_equity_snapshots" ADD COLUMN IF NOT EXISTS "pnl_cum_minor" text DEFAULT '0';
DROP INDEX IF EXISTS "sim_equity_snapshots_strategy_ts_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "sim_equity_snapshots_user_strategy_ts_idx" ON "sim_equity_snapshots" ("user_id", "strategy_id", "ts");

CREATE TABLE IF NOT EXISTS "sim_allocations" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "strategy_id" varchar NOT NULL REFERENCES "strategies"("id"),
  "amount_minor" text NOT NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "request_id" varchar,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sim_allocations_user_strategy_idx" ON "sim_allocations" ("user_id", "strategy_id");
CREATE INDEX IF NOT EXISTS "sim_allocations_request_idx" ON "sim_allocations" ("user_id", "request_id");

CREATE TABLE IF NOT EXISTS "benchmark_series" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "benchmark" text NOT NULL,
  "ts" bigint NOT NULL,
  "value" text NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "benchmark_series_unique_idx" ON "benchmark_series" ("benchmark", "ts");
CREATE INDEX IF NOT EXISTS "benchmark_series_benchmark_ts_idx" ON "benchmark_series" ("benchmark", "ts");

CREATE TABLE IF NOT EXISTS "invest_state" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "strategy_id" varchar NOT NULL REFERENCES "strategies"("id"),
  "state" text NOT NULL,
  "request_id" varchar,
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "invest_state_user_strategy_idx" ON "invest_state" ("user_id", "strategy_id");
CREATE INDEX IF NOT EXISTS "invest_state_user_request_idx" ON "invest_state" ("user_id", "request_id");
