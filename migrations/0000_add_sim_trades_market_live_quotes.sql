CREATE TABLE IF NOT EXISTS "market_live_quotes" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "symbol" text NOT NULL,
  "ts" bigint NOT NULL,
  "price" text NOT NULL,
  "source" text DEFAULT 'sim',
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "market_live_quotes_symbol_unique_idx" ON "market_live_quotes" ("symbol");
CREATE INDEX IF NOT EXISTS "market_live_quotes_ts_idx" ON "market_live_quotes" ("ts");

CREATE TABLE IF NOT EXISTS "sim_trades" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" varchar NOT NULL REFERENCES "sim_sessions" ("id"),
  "ts" bigint NOT NULL,
  "symbol" text NOT NULL,
  "side" text NOT NULL,
  "qty" text NOT NULL,
  "price" text NOT NULL,
  "meta" jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sim_trades_session_ts_idx" ON "sim_trades" ("session_id", "ts");
CREATE INDEX IF NOT EXISTS "sim_trades_symbol_ts_idx" ON "sim_trades" ("symbol", "ts");
