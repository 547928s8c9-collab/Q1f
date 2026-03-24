# ZEON Fintech Dashboard

## Q1F Mobile Web App
Route `/q1f` serves a standalone mobile web app for the Q1F crypto platform. Built with Apple-inspired design system (white bg, shadows, glassmorphism nav, SF Pro fonts). All UI in Russian. Files in `client/src/pages/q1f/`:
- `tokens.ts` — design tokens (colors, spacing, typography, shadows, transitions)
- `components.tsx` — shared components (Card, Badge, Button, TabBar, Icon, CryptoIcon, Sparkline)
- `index.tsx` — app shell with bottom nav and screen switching
- `screens/portfolio.tsx` — main portfolio screen with balance, chart, quick actions, asset list
- `screens/exchange.tsx` — buy/sell crypto with currency selectors
- `screens/ai-invest.tsx` — AI investment strategies (Conservative, Balanced, Aggressive)
- `screens/wallet.tsx` — wallet balances, BTC address, transaction history
- `screens/profile.tsx` — user profile, verification, settings menu

## Overview
ZEON is a production-grade fintech web dashboard MVP for digital asset management, inspired by Revolut with an Anthropic-style minimal design. It enables portfolio management, investment strategies, wallet operations, activity tracking, and security settings, supporting both cryptocurrency (USDT) and fiat (RUB) operations. The platform aims to provide a secure, transparent, and user-friendly experience for managing digital finances, offering real-time portfolio charts, investment strategy tracking, vault management, and comprehensive transaction history.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode)
- **UI Components**: shadcn/ui built on Radix UI primitives
- **Charts**: Recharts
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Pattern**: RESTful JSON API (`/api` prefix)

### Data Management
- **ORM**: Drizzle ORM (PostgreSQL dialect)
- **Database**: PostgreSQL
- **Schema**: Defined in `shared/schema.ts`
- **Migrations**: Drizzle Kit
- **Foreign Key Constraints**: Enforced for referential integrity.

### Authentication & Authorization
- **Authentication**: Replit Auth (OIDC-based)
- **Security**: `isAuthenticated` middleware for all API routes.
- **User Management**: Default data initialization for new users.

### Onboarding
- **Process**: 3-step flow (Verify Contact, Accept Consent, Complete KYC).
- **KYC State Machine**: Manages states like NOT_STARTED, IN_REVIEW, APPROVED, NEEDS_ACTION, REJECTED, ON_HOLD, integrating with Sumsub.
- **Smart Start Onboarding**: Post-KYC questionnaire for personalized investment strategy recommendations based on risk tolerance, time horizon, and investment goals.

### Investor Analytics
- **Overview**: Comprehensive portfolio summary including total equity, 30-day PnL, ROI, and max drawdown.
- **Strategy Breakdown**: Detailed per-strategy allocation, value, PnL, and ROI.
- **Equity Series**: Historical portfolio value data for charting.

### Core Features
- **Notifications**: Real-time system with customizable preferences (in-app, email, Telegram, marketing).
- **Activity Export**: CSV export of transaction history.
- **Monthly Statements**: PDF generation of financial summaries.
- **Status Page**: System health monitoring (`/status`) with component-level status.
- **Observability**: Request ID middleware, structured logging, and in-memory metrics.
- **Security Headers**: Helmet middleware for secure defaults.
- **Rate Limiting**: Tiered protection for various API endpoints using `express-rate-limit`.

### Demo Mode
- **Demo Data Seeder**: Client-side hook (`useDemoDataSeeder`) seeds TanStack Query cache with hardcoded "Алишер Н., Ташкент" persona data when `user.email === "demo@example.com"`.
- **Seed Data**: `client/src/lib/demo-seed.ts` — portfolio history (Oct 2025–Mar 2026), 3 withdrawals, 11 activity events, monthly P&L with one negative month (Nov 2025: -31.50).
- **Cache Targets**: `/api/bootstrap` (balances, portfolioSeries, invested), `/api/analytics/overview` (5 time windows), `/api/operations`, `/api/statements/summary` (per month).

### Fiat On-Ramp
- **Card Deposit**: Russian-localized page (`Карта → USDT`) with simulated RUB→USDT conversion.
- **MoonPay Integration**: Amount input with 2.5% fee estimate, VISA/MC badges, safe URL construction via `URLSearchParams`. Requires `VITE_MOONPAY_API_KEY` env var.
- **Onramper Fallback**: Collapsible accordion with Telegram support link for alternative payment methods.

### Investment & Payout System
- **Strategy Catalog**: 8 investment strategies across 3 risk tiers (Стабильный/Активный/Агрессивный) with computed tier metadata.
- **Position Tracking**: Manages principal, invested, accrued profit, and last accrual date.
- **Payout Instructions**: Configurable per-strategy payout frequency and whitelisted address requirements.
- **Redemption Requests**: Manages principal redemption with defined statuses and weekly execution windows.

### Vault Goals System
- **Functionality**: Allows users to set saving goals with progress tracking.

### Live Session Simulation System
- **Purpose**: Simulates trading sessions with replay or lagged-live modes.
- **Architecture**: `SessionRunner` manages sessions, events, and status transitions.
- **Streaming**: Real-time event delivery via SSE with heartbeat.
- **Control API**: Start/pause/resume/stop functionality.
- **Persistence**: Events and session state persisted to the database for restart resilience.
- **Strategy Profiles**: Configurable parameters for 8 predefined strategy profiles.

### Live Market Ticker Engine
- **Purpose**: Generates real-time price ticks for 8 crypto pairs (BTC/USDT, ETH/USDT, BNB/USDT, SOL/USDT, XRP/USDT, DOGE/USDT, ADA/USDT, TRX/USDT) and simulated trades.
- **Architecture**: Singleton `LiveTickerEngine` (`server/services/liveTickerEngine.ts`) uses Brownian motion with per-pair volatility/drift parameters, generates ticks every 2.5s.
- **Streaming**: SSE endpoint `/api/market/stream` with init snapshot + live tick events. Connection cap of 50 concurrent SSE connections with unified cleanup.
- **REST API**: `GET /api/market/quotes` (all current prices), `GET /api/market/quotes/:symbol/sparkline` (24h sparkline), `GET /api/market/trades` (recent simulated trades).
- **Frontend**: Singleton `MarketStreamStore` using `useSyncExternalStore` prevents unnecessary re-renders. `LiveQuotesBar` (horizontally scrollable 8-pair cards with mini-sparklines and price flash animations) appears on Home and Dashboard. `LiveTradeFeed` (animated trade log with ПОКУПКА/ПРОДАЖА badges) appears on Dashboard.
- **CSS Animations**: `price-flash-up`/`price-flash-down` (green/red background flash), `trade-slide-in` (slide-in for new trades).
- **Key Files**: `server/services/liveTickerEngine.ts`, `server/routes/market.ts`, `client/src/hooks/use-market-stream.ts`, `client/src/components/live-quotes-bar.tsx`, `client/src/components/live-trade-feed.tsx`.

### Admin Console (Backend API)
- **Architecture**: Separate overlay at `/api/admin/*` with RBAC system (5 roles, 26 permissions).
- **Security**: OIDC claims in production, dev fallback via `x-replit-user-id` header, RBAC cache.
- **Logging & Idempotency**: Audit logging for mutations and idempotency key enforcement.
- **Key Features**:
    - **KYC Queue Management**: Admin UI for reviewing and deciding on KYC applications with state transitions and permissions (`kyc.read`, `kyc.review`).
    - **Withdrawals Queue Management**: Admin UI for managing withdrawals with a 4-eyes approval workflow (`makerAdminUserId`, `checkerAdminUserId`) and permissions (`withdrawals.read`, `withdrawals.approve`, `withdrawals.manage`).
    - **Incident Management**: Creation and update of system incidents with state transitions and security checks for critical updates.

### Key Design Decisions
- **Multi-User Architecture**: All data is user-scoped and initialized on first login.
- **Money Handling**: All monetary amounts stored as string minor units to prevent precision errors.
- **Shared Schema**: `shared/` directory for type safety across frontend and backend.
- **Operation-Driven Flow**: All financial actions recorded as `Operation` records.
- **Bootstrap Endpoint**: `/api/bootstrap` provides initial data for client-side loading.
- **Custom UI Primitives**: Revolut-inspired design components.
- **Path Aliases**: `@/`, `@shared/`, `@assets/`.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **Drizzle ORM**: Database interaction.
- **connect-pg-simple**: PostgreSQL session store.

### UI Framework
- **Radix UI**: Headless component primitives.
- **shadcn/ui**: Pre-styled components.
- **Tailwind CSS**: Styling framework.
- **Lucide React**: Icon library.

### Data & State
- **TanStack React Query**: Server state management.
- **Zod**: Schema validation.
- **drizzle-zod**: Zod schema generation from Drizzle.

### Charts
- **Recharts**: Charting library.
- **embla-carousel-react**: Carousel functionality.

### Development Tools
- **Vite**: Frontend build tool.
- **tsx**: TypeScript execution for server.
- **esbuild**: Server code bundling.