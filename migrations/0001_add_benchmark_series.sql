CREATE TABLE IF NOT EXISTS "benchmark_series" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "asset" text NOT NULL,
  "timeframe_days" integer NOT NULL,
  "date" text NOT NULL,
  "value" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "benchmark_series_asset_timeframe_date_idx" ON "benchmark_series" ("asset", "timeframe_days", "date");
CREATE INDEX IF NOT EXISTS "benchmark_series_asset_timeframe_idx" ON "benchmark_series" ("asset", "timeframe_days");
