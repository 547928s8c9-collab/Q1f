# ZEON Fintech Dashboard

## Overview
ZEON is a production-grade fintech web dashboard MVP, offering digital asset management inspired by Revolut with an Anthropic-style minimal design. It enables portfolio management, investment strategies, wallet operations, activity tracking, and security settings. The application supports cryptocurrency and fiat currency operations (USDT and RUB), providing real-time portfolio charts, investment strategy tracking, vault management, and comprehensive transaction history. The project's vision is to provide a robust, user-friendly platform for managing digital finances with a focus on security, transparency, and efficient financial operations.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode)
- **UI Components**: shadcn/ui built on Radix UI primitives
- **Charts**: Recharts for data visualization
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Pattern**: RESTful JSON API (`/api` prefix)

### Data Management
- **ORM**: Drizzle ORM (PostgreSQL dialect)
- **Database**: PostgreSQL (configured via `DATABASE_URL`)
- **Schema**: Defined in `shared/schema.ts`
- **Migrations**: Drizzle Kit

### Authentication & Authorization
- **Authentication**: Replit Auth (OIDC-based)
- **User Management**: Integrated with `shared/schema.ts` and `shared/models/auth.ts`
- **Security**: `isAuthenticated` middleware for all API routes; `getUserId(req)` for user context
- **User Initialization**: `storage.ensureUserData(userId)` sets up default data for new users

### Onboarding
- **Process**: 3-step flow: Verify Contact, Accept Consent, Complete KYC.
- **Onboarding States**: Managed by `securitySettings` to guide users through "verify", "consent", "kyc", and "done" stages.
- **GateGuard Component**: Redirects users to the appropriate onboarding step.

### KYC State Machine
- **States**: NOT_STARTED, IN_REVIEW, APPROVED, NEEDS_ACTION, REJECTED, ON_HOLD.
- **Transitions**: Defined state transitions to manage the KYC verification process.
- **Integration**: Sumsub (with demo mode).

### Smart Start Onboarding
- **Purpose**: Post-KYC investment questionnaire for personalized strategy recommendations.
- **Questionnaire**: 3 questions on risk tolerance, time horizon, and investment goal.
- **Recommendation Engine**: Rule-based scoring generating risk scores and profile labels (e.g., Safety-First Saver) with suggested deposit amounts and strategy allocations.

### Core Features
- **Notifications**: Real-time system with unread count, individual/bulk mark-as-read, and various notification types (transaction, security, kyc, system).
- **Activity Export**: CSV export of transaction history with filtering options.
- **Monthly Statements**: PDF generation of monthly summaries (Total In, Total Out, Fees, Net Change) viewable and downloadable.
- **Status Page**: System health monitoring (`/status`) with component-level status (Deposits, Withdrawals, Investment Strategies, API Services) and configurable banners.
- **Observability**: Request ID middleware, structured logging, and in-memory metrics counters with an exposed metrics endpoint.

### Investment & Payout System
- **Strategy Catalog**: 8 investment strategies with risk tiers, demo performance data, and comparison charts.
- **Position Tracking**: Manages `principalMinor`, `investedCurrentMinor`, `accruedProfitPayableMinor`, and `lastAccrualDate`.
- **Payout Instructions**: Configurable per-strategy payout frequency (DAILY/MONTHLY) with minimum payout amounts and whitelisted address requirements.
- **Redemption Requests**: Manages principal redemption with PENDING, EXECUTED, CANCELLED statuses and weekly execution windows.
- **Operation Types**: Defines PROFIT_ACCRUAL, PROFIT_PAYOUT, PRINCIPAL_REDEEM_EXECUTED.

### Vault Goals System
- **Functionality**: Allows users to set saving goals with `goalName`, `goalAmount`, `autoSweepPct`, and `autoSweepEnabled`.
- **Progress Tracking**: Calculates progress percentage based on current balance and goal amount.

### Live Session Simulation System
- **Tables**: `sim_sessions` (session metadata, status, config) and `sim_events` (streaming events with seq numbers)
- **SessionRunner**: Singleton manager (`server/sim/runner.ts`) with tick loop, event emission via EventEmitter
- **Status Flow**: CREATED → RUNNING → (PAUSED ↔ RUNNING) → FINISHED/STOPPED/FAILED
- **SSE Streaming**: Real-time event delivery via `/api/sim/sessions/:id/stream` with heartbeat keepalive
- **Control API**: Start/pause/resume/stop via `/api/sim/sessions/:id/control`
- **Persistence**: Events persisted to `sim_events` table with lastSeq tracking for replay
- **Strategy Profiles**: 8 profiles (btc_squeeze_breakout, eth_ema_revert, etc.) with configurable parameters
- **Deterministic Execution**: No Date.now()/Math.random(), sorted outputs, stable sequence numbers

### Admin Console (Backend API)
- **Architecture**: Separate overlay at `/api/admin/*`, doesn't modify existing user-facing routes
- **RBAC System**: 5 roles (SuperAdmin, Ops, Compliance, Support, ReadOnly) with 26 granular permissions
- **Admin Tables**: `admin_users`, `roles`, `permissions`, `role_permissions`, `admin_user_roles`, `admin_audit_logs`, `admin_idempotency_keys`, `pending_admin_actions`, `outbox_events`, `admin_inbox_items`, `incidents`
- **Envelope Pattern**: All admin endpoints return `{ok, data, meta?, requestId}`
- **Pagination**: Cursor-based (createdAt+id) with `meta.nextCursor`
- **Error Codes**: `RBAC_DENIED` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (400), `ADMIN_REQUIRED` (401)
- **Middleware Stack**: `ensureRequestId` → `adminAuth` → `loadPermissions` → `requirePermission()`
- **Read-only Endpoints**: `/api/admin/me`, `/api/admin/users`, `/api/admin/users/:id`, `/api/admin/operations`, `/api/admin/operations/:id`, `/api/admin/inbox`
- **Files**: `server/admin/http.ts`, `server/admin/router.ts`, `server/admin/middleware/*`, `shared/admin/dto.ts`

### Key Design Decisions
- **Multi-User Architecture**: All data is user-scoped and initialized upon first login.
- **Money Handling**: All monetary amounts stored as string minor units to prevent precision errors (e.g., USDT 6 decimals, RUB 2 decimals).
- **Shared Schema**: `shared/` directory for type safety across frontend and backend.
- **Database Storage**: `server/storage.ts` uses Drizzle ORM, connected via `server/db.ts`.
- **Operation-Driven Flow**: All financial actions recorded as `Operation` records.
- **Bootstrap Endpoint**: `/api/bootstrap` serves as a single source of truth for initial data loading.
- **Component Organization**: Standardized structure for UI, charts, operations, and page components.
- **Custom UI Primitives**: Revolut-inspired design components (`Money`, `SectionHeader`, `Chip`, `IconButton`, `Skeleton`, `EmptyState`).
- **Path Aliases**: `@/` (client/src), `@shared/` (shared/), `@assets/` (attached_assets/).

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