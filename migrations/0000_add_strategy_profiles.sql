CREATE TABLE IF NOT EXISTS "strategy_profiles" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "display_name" text NOT NULL,
  "symbol" text NOT NULL,
  "timeframe" text NOT NULL,
  "description" text,
  "risk_level" text NOT NULL,
  "tags" jsonb,
  "default_config" jsonb NOT NULL,
  "config_schema" jsonb,
  "is_enabled" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "strategy_profiles_slug_idx" ON "strategy_profiles" ("slug");
