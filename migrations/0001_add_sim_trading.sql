CREATE TABLE IF NOT EXISTS "sim_positions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "strategy_id" varchar NOT NULL REFERENCES "strategies"("id"),
  "profile_slug" text NOT NULL,
  "symbol" text NOT NULL,
  "timeframe" text NOT NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "cash_minor" text NOT NULL DEFAULT '0',
  "position_side" text NOT NULL DEFAULT 'FLAT',
  "position_qty" text NOT NULL DEFAULT '0',
  "position_entry_price" text NOT NULL DEFAULT '0',
  "position_entry_ts" bigint,
  "equity_minor" text NOT NULL DEFAULT '0',
  "peak_equity_minor" text NOT NULL DEFAULT '0',
  "last_candle_ts" bigint,
  "last_snapshot_ts" bigint,
  "drift_bps_monthly" integer NOT NULL DEFAULT 0,
  "drift_scale" text NOT NULL DEFAULT '1',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "sim_positions_strategy_idx" ON "sim_positions" ("strategy_id");

CREATE TABLE IF NOT EXISTS "sim_trades" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "strategy_id" varchar NOT NULL REFERENCES "strategies"("id"),
  "status" text NOT NULL DEFAULT 'OPEN',
  "entry_ts" bigint,
  "exit_ts" bigint,
  "entry_price" text,
  "exit_price" text,
  "qty" text NOT NULL DEFAULT '0',
  "gross_pnl_minor" text DEFAULT '0',
  "fees_minor" text DEFAULT '0',
  "net_pnl_minor" text DEFAULT '0',
  "hold_bars" integer,
  "reason" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sim_trades_strategy_entry_idx" ON "sim_trades" ("strategy_id", "entry_ts");
CREATE INDEX IF NOT EXISTS "sim_trades_strategy_status_idx" ON "sim_trades" ("strategy_id", "status");

CREATE TABLE IF NOT EXISTS "sim_equity_snapshots" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "strategy_id" varchar NOT NULL REFERENCES "strategies"("id"),
  "ts" bigint NOT NULL,
  "equity_minor" text NOT NULL,
  "cash_minor" text NOT NULL,
  "position_value_minor" text NOT NULL,
  "drawdown_bps" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "sim_equity_snapshots_strategy_ts_idx" ON "sim_equity_snapshots" ("strategy_id", "ts");
