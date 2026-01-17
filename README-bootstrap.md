# Bootstrap ZEON Fintech Dashboard

This guide explains how to set up and bootstrap the ZEON environment for local development.

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database

## Step-by-Step Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Create a `.env` file (or set in your environment) with:
   - `DATABASE_URL`: Your PostgreSQL connection string
   - `ALLOW_DEV_ADMIN_HEADER`: Set to `true` to enable `x-replit-user-id` in dev for admin auth (default: `false`)

3. **Initialize Database Schema**
   Push the Drizzle schema to your PostgreSQL instance:
   ```bash
   npm run db:push
   ```

4. **Seed Demo Data**
   Populate the database with the initial demo user and 90 days of historical data:
   ```bash
   npm run db:seed
   ```

5. **Start Application**
   Run the development server (starts both Express and Vite):
   ```bash
   npm run dev
   ```

## Available Database Scripts

- `npm run db:push`: Syncs the `shared/schema.ts` with the database (use for migrations).
- `npm run db:seed`: Clears and re-seeds the database with fresh demo data.
- `npm run check`: Runs TypeScript compiler check.

## Health Monitoring

The API provides a health check endpoint at `/api/health` which verifies the database connection.
