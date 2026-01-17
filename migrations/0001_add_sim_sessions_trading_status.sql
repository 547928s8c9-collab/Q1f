ALTER TABLE "sim_sessions"
  ADD COLUMN IF NOT EXISTS "trading_status" text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "trading_paused_reason" text;
