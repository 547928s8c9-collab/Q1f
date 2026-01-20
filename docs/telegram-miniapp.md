# Telegram Mini App

This document describes the minimal infrastructure needed to prepare the project for a Telegram Mini App while preserving existing web flows.

## TG Strategy Mini App v2

New TG UI lives at `/tg/v2` (and `/tg` after switch-over), while legacy `/tg/legacy` remains available for rollback.

### Screens

- **Overview**: Total equity, ROI / max drawdown, top 3 strategies, sparkline.
- **Strategies**: Risk tier filter + live metrics + sparkline.
- **Strategy detail**: Metrics, equity sparkline, optional price chart (capped candles), recent trades, trade detail bottom sheet.
- **Activity**: Recent trades feed + unread notifications.

### Polling plan

- `/api/tg/bootstrap`: on session start and manual refresh
- `/api/tg/strategies`: every 12s
- `/api/tg/strategies/:id`: every 12s while detail is open
- `/api/tg/strategies/:id/trades`: every 12s while detail is open
- `/api/tg/activity`: every 12s

## Environment variables

Add these variables to the server environment:

**Required:**
- `TELEGRAM_BOT_TOKEN` - Bot token from BotFather
- `TELEGRAM_JWT_SECRET` - Secret key for signing Telegram JWT tokens
- `DATABASE_URL` - PostgreSQL connection string

**Optional (for notifications and webhook):**
- `TELEGRAM_NOTIFICATIONS_ENABLED` - Set to `"true"` to enable Telegram notifications (default: disabled)
- `TELEGRAM_WEBHOOK_SECRET` - Secret token for webhook security (required in production)
- `TELEGRAM_PUBLIC_WEBAPP_URL` - Public HTTPS URL for the Telegram Mini App (e.g., `https://yourdomain.com/tg`)

## Telegram requirements

BotFather requires a **HTTPS WebApp URL** when you configure the Mini App. Make sure your deployment provides HTTPS before registering the URL.

## Linking Telegram Account

### Step-by-Step Guide: One-time Link Tokens (Recommended)

**Step 1: Get a link code**

You need to generate a one-time link code from your web account:

1. **Log in to your web account** (not in Telegram)
2. **Call the link-token API endpoint**:
   ```bash
   POST /api/telegram/link-token
   Authorization: Bearer <your-web-jwt-token>
   ```
   
   Example using curl:
   ```bash
   curl -X POST https://yourdomain.com/api/telegram/link-token \
     -H "Authorization: Bearer YOUR_WEB_JWT_TOKEN" \
     -H "Content-Type: application/json"
   ```
   
   Response:
   ```json
   {
     "ok": true,
     "data": {
       "code": "ABC123XY",
       "expiresAt": "2024-01-01T12:10:00.000Z"
     }
   }
   ```
   
   **Important:**
   - The code expires in **10 minutes**
   - Each code can only be used **once**
   - You must be authenticated with your web account JWT token

**Step 2: Use the code in Telegram Mini App**

1. Open the Telegram Mini App (via your bot or direct link)
2. Navigate to the linking screen
3. Enter the code you received from Step 1
4. The system will link your Telegram account to your web account

**Step 3: Authenticate in Telegram**

After linking, use the Telegram auth endpoint to get a Telegram JWT token:

```bash
POST /api/telegram/auth
Content-Type: application/json

{
  "initData": "<telegram-webapp-init-data>"
}
```

The `initData` is automatically provided by Telegram when the Mini App is opened. You can access it via `window.Telegram.WebApp.initData` in the frontend.

### Legacy Method: Anti-Phishing Code (Fallback)

For backward compatibility, the system still supports linking via `antiPhishingCode` from security settings. This method is deprecated but will continue to work for existing users.

### API Endpoints

- `POST /api/telegram/link-token` - Generate a new one-time link token (requires web authentication)
- `POST /api/telegram/link/confirm` - Confirm linking with a code (from Telegram Mini App, requires `initData`)
- `POST /api/telegram/auth` - Authenticate and get Telegram JWT token (requires `initData` and linked account)

### TG v2 endpoints (Telegram JWT required)

- `GET /api/tg/bootstrap` - Balances, positions, unread notifications
- `GET /api/tg/engine/status` - Engine status (state/last tick/loops/error)
- `GET /api/tg/strategies` - Compact strategy list + sparklines
- `GET /api/tg/strategies/:id` - Strategy detail + equity series
- `GET /api/tg/strategies/:id/candles` - Capped candles for mini price chart
- `GET /api/tg/strategies/:id/trades` - Trades with cursor pagination
- `GET /api/tg/strategies/:id/trade-events` - Trade events (limit ≤ 200)
- `GET /api/tg/activity` - Aggregated recent trades + notifications

### Limits

- `/api/tg/strategies`: `limit` ≤ 50, `sparkline` ≤ 30 points
- `/api/tg/strategies/:id`: `periodDays` ≤ 180, `equitySeries` ≤ 200
- `/api/tg/strategies/:id/candles`: `limit` ≤ 600, `periodDays` ≤ 30
- `/api/tg/strategies/:id/trades`: `limit` ≤ 50
- `/api/tg/strategies/:id/trade-events`: `limit` ≤ 200

## Database Migrations

Before testing the Telegram Mini App, ensure all database migrations are applied:

1. **Generate migrations** (if schema changed):
   ```bash
   npm run db:generate
   ```

2. **Apply migrations**:
   
   **Option A: Using psql (recommended for production)**:
   ```bash
   # Apply all migrations in order
   psql $DATABASE_URL -f migrations/0000_add_strategy_profiles.sql
   psql $DATABASE_URL -f migrations/0001_add_sim_trading.sql
   psql $DATABASE_URL -f migrations/0002_invest_architecture.sql
   psql $DATABASE_URL -f migrations/0003_add_telegram_link_tokens.sql
   psql $DATABASE_URL -f migrations/0004_add_telegram_accounts_and_notifications.sql
   ```
   
   **Option B: Using drizzle-kit migrate** (if available):
   ```bash
   npm run db:migrate
   ```
   
   **Option C: Using db:push (development only)**:
   ```bash
   npm run db:push
   ```
   ⚠️ **Warning**: `db:push` syncs schema directly and should **only** be used in development. Never use in production.

3. **Verify migration status**:
   Check that the following tables exist:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('telegram_accounts', 'telegram_link_tokens', 'notification_preferences');
   ```
   
   Verify columns:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'notification_preferences' 
   AND column_name = 'telegram_enabled';
   ```

**Migration files**:
- `0003_add_telegram_link_tokens.sql` - Creates `telegram_link_tokens` table
- `0004_add_telegram_accounts_and_notifications.sql` - Creates `telegram_accounts` table and adds `telegram_enabled` to `notification_preferences`
- `0005_add_telegram_action_tokens.sql` - Creates `telegram_action_tokens` table (for interactive buttons)

## Enabling Telegram Notifications

Telegram notifications allow users to receive important updates (KYC status, security alerts, transactions) directly in Telegram.

### Server Configuration

1. **Set environment variable**:
   ```bash
   TELEGRAM_NOTIFICATIONS_ENABLED=true
   ```
   
   This enables the outbox worker that processes notification events. Without this flag, notifications will not be sent even if users enable them.

2. **Restart the server** after setting the environment variable.

### User Configuration

Users can enable/disable notifications via API:

**Check notification status:**
```bash
GET /api/telegram/notifications/status
Authorization: Bearer <web-jwt-token>
```

**Enable notifications:**
```bash
POST /api/telegram/notifications/enable
Authorization: Bearer <web-jwt-token>
```

**Disable notifications:**
```bash
POST /api/telegram/notifications/disable
Authorization: Bearer <web-jwt-token>
```

**Requirements:**
- User must have a linked Telegram account (see Linking section above)
- Server must have `TELEGRAM_NOTIFICATIONS_ENABLED=true`
- User must explicitly enable notifications via the API

**Notification types:**
- KYC approval/rejection
- Security alerts (strategy auto-paused)
- Transaction confirmations (deposits, withdrawals)

## Setting Up Telegram Bot Webhook

The webhook enables interactive features like Refresh buttons and `/start` command handling.

### Step 1: Configure Webhook Secret

1. **Generate a secure random secret** (e.g., using `openssl rand -hex 32`)
2. **Set environment variable**:
   ```bash
   TELEGRAM_WEBHOOK_SECRET=your-generated-secret-here
   ```
   
   **Important:** In production (`NODE_ENV=production`), the webhook endpoint will reject requests without the correct `X-Telegram-Bot-Api-Secret-Token` header.

### Step 2: Set Webhook URL

Use the Telegram Bot API to set your webhook URL:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourdomain.com/api/telegram/bot/webhook",
    "secret_token": "your-generated-secret-here",
    "allowed_updates": ["message", "callback_query"]
  }'
```

**Parameters:**
- `url` - Your public HTTPS webhook endpoint: `https://yourdomain.com/api/telegram/bot/webhook`
- `secret_token` - Must match `TELEGRAM_WEBHOOK_SECRET` environment variable
- `allowed_updates` - Array of update types to receive (recommended: `["message", "callback_query"]`)

### Step 3: Verify Webhook

Check webhook status:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

You should see:
```json
{
  "ok": true,
  "result": {
    "url": "https://yourdomain.com/api/telegram/bot/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

### Step 4: Test Webhook

1. Send `/start` to your bot in Telegram
2. The bot should respond with a welcome message and portfolio summary
3. Click the Refresh button to test callback queries

### Troubleshooting

**Webhook not receiving updates:**
- Verify `TELEGRAM_WEBHOOK_SECRET` matches the secret_token in setWebhook
- Check that your server is accessible via HTTPS
- Verify the webhook URL is correct and returns 200 OK
- Check server logs for webhook errors

**Production security:**
- In production, the webhook endpoint requires the `X-Telegram-Bot-Api-Secret-Token` header
- If the header is missing or incorrect, the request will be rejected with 401
- Always use HTTPS for webhook URLs
