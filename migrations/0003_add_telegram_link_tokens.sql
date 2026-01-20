CREATE TABLE IF NOT EXISTS "telegram_link_tokens" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(10) NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "telegram_link_tokens_code_idx" ON "telegram_link_tokens" ("code");
CREATE INDEX IF NOT EXISTS "telegram_link_tokens_user_id_idx" ON "telegram_link_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "telegram_link_tokens_expires_at_idx" ON "telegram_link_tokens" ("expires_at");
