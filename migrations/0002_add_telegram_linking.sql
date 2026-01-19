CREATE TABLE IF NOT EXISTS "telegram_accounts" (
  "user_id" varchar PRIMARY KEY NOT NULL REFERENCES "users"("id"),
  "telegram_user_id" text NOT NULL,
  "linked_at" timestamp DEFAULT now(),
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "telegram_accounts_telegram_user_idx" ON "telegram_accounts" ("telegram_user_id");

CREATE TABLE IF NOT EXISTS "telegram_link_tokens" (
  "code" varchar(10) NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "telegram_link_tokens_code_idx" ON "telegram_link_tokens" ("code");
CREATE INDEX IF NOT EXISTS "telegram_link_tokens_user_idx" ON "telegram_link_tokens" ("user_id");
