# Telegram Mini App

This document describes the minimal infrastructure needed to prepare the project for a Telegram Mini App while preserving existing web flows.

## Environment variables

Add these variables to the server environment:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_JWT_SECRET`
- `TELEGRAM_WEBHOOK_SECRET` (secret_token for Telegram webhook verification)
- `TELEGRAM_PUBLIC_WEBAPP_URL` (for example `https://<host>/tg`)
- `TELEGRAM_NOTIFICATIONS_ENABLED` (set to `true` to enable TG-4 notifications)
- `DATABASE_URL` (as usual, for Postgres)

## Telegram requirements

BotFather requires a **HTTPS WebApp URL** when you configure the Mini App. Make sure your deployment provides HTTPS before registering the URL.

## Webhook setup

Telegram webhooks must be HTTPS. Use `setWebhook` with the `secret_token` header value so the backend can verify requests:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<host>/api/telegram/bot/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

To inspect the current webhook:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

## Smoke checks

1. Open the bot in Telegram and send `/start`.
2. Tap **Open App** to open the mini app at `/tg`.
3. Tap **Refresh** to update the summary and ensure the message edits in place.
