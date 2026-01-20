CREATE TABLE IF NOT EXISTS "telegram_action_tokens" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token" varchar(32) NOT NULL,
  "telegram_user_id" text NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "action" text NOT NULL,
  "payload_json" jsonb,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "telegram_action_tokens_token_idx" ON "telegram_action_tokens" ("token");
CREATE INDEX IF NOT EXISTS "telegram_action_tokens_telegram_user_id_idx" ON "telegram_action_tokens" ("telegram_user_id");
CREATE INDEX IF NOT EXISTS "telegram_action_tokens_user_id_idx" ON "telegram_action_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "telegram_action_tokens_expires_at_idx" ON "telegram_action_tokens" ("expires_at");
