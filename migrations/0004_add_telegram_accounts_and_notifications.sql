-- Create telegram_accounts table
CREATE TABLE IF NOT EXISTS "telegram_accounts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "telegram_user_id" varchar NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "telegram_accounts_user_idx" ON "telegram_accounts" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_accounts_telegram_user_idx" ON "telegram_accounts" ("telegram_user_id");

-- Create notification_preferences table if it doesn't exist
CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "user_id" varchar PRIMARY KEY REFERENCES "users"("id"),
  "in_app_enabled" boolean NOT NULL DEFAULT true,
  "email_enabled" boolean NOT NULL DEFAULT false,
  "telegram_enabled" boolean NOT NULL DEFAULT false,
  "marketing_enabled" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Add telegram_enabled column if notification_preferences exists but column is missing
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_preferences') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'notification_preferences' AND column_name = 'telegram_enabled') THEN
      ALTER TABLE "notification_preferences" ADD COLUMN "telegram_enabled" boolean NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'notification_preferences' AND column_name = 'in_app_enabled') THEN
      ALTER TABLE "notification_preferences" ADD COLUMN "in_app_enabled" boolean NOT NULL DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'notification_preferences' AND column_name = 'marketing_enabled') THEN
      ALTER TABLE "notification_preferences" ADD COLUMN "marketing_enabled" boolean NOT NULL DEFAULT false;
    END IF;
  END IF;
END $$;
