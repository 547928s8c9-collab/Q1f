# Telegram Mini App

This document describes the minimal infrastructure needed to prepare the project for a Telegram Mini App while preserving existing web flows.

## Environment variables

Add these variables to the server environment:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_JWT_SECRET`
- `DATABASE_URL` (as usual, for Postgres)

## Telegram requirements

BotFather requires a **HTTPS WebApp URL** when you configure the Mini App. Make sure your deployment provides HTTPS before registering the URL.
