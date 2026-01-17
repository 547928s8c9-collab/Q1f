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
- **Foreign Key Constraints**: All userId fields reference `users.id`, strategyId fields reference `strategies.id`, with RESTRICT behavior for data integrity
- **Orphan Check Script**: `scripts/check-orphans.ts` validates referential integrity across 24 table/column combinations

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
- **Security Headers**: Helmet middleware with secure defaults (Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options, etc.).
- **Rate Limiting**: express-rate-limit with tiered protection:
  - `/api/*` general: 120 req/min
  - `/api/login`, `/api/callback`: 20 req/min (auth protection)
  - `/api/metrics`: 10 req/min (admin endpoint)
  - `/api/market`, `/api/strategies`: 60 req/min (anti-scraping)

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
- **Tables**: `sim_sessions` (session metadata, status, config, cursorMs) and `sim_events` (streaming events with seq numbers)
- **SessionRunner**: Singleton manager (`server/sim/runner.ts`) with tick loop, event emission via EventEmitter
- **Status Flow**: CREATED → RUNNING → (PAUSED ↔ RUNNING) → FINISHED/STOPPED/FAILED
- **Session Modes**: `replay` (historical data with fixed endMs) and `lagged_live` (live data with lagMs delay, nullable endMs)
- **Cursor-Based Streaming**: Candles loaded in batches via cursorMs, persisted after each tick for restart resilience
- **SSE Streaming**: Real-time event delivery via `/api/sim/sessions/:id/stream` with heartbeat keepalive; supports fromSeq for backlog replay
- **Control API**: Start/pause/resume/stop via `/api/sim/sessions/:id/control`
- **Persistence**: Events persisted to `sim_events` table with lastSeq tracking; cursorMs persisted for resume
- **Restart Safety**: `resetRunningSessions()` called on server boot to transition RUNNING → PAUSED
- **Atomic Transitions**: `transitionSimSessionStatus()` for safe status changes with expected-state validation
- **Strategy Profiles**: 8 profiles (btc_squeeze_breakout, eth_ema_revert, etc.) with configurable parameters
- **Timing Config**: `replayMsPerCandle` (100-60000ms) for replay pacing, `lagMs` (60s-1h) for live delay
- **Selftest**: `server/sim/selftest.ts` validates all storage APIs and session lifecycle
- **Files**: `server/sim/runner.ts`, `server/sim/selftest.ts`, `shared/schema.ts` (simSessions, SimSessionMode)

### Admin Console (Backend API)
- **Architecture**: Separate overlay at `/api/admin/*`, doesn't modify existing user-facing routes
- **RBAC System**: 5 roles (SuperAdmin, Ops, Compliance, Support, ReadOnly) with 26 granular permissions
- **Admin Tables**: `admin_users`, `roles`, `permissions`, `role_permissions`, `admin_user_roles`, `admin_audit_logs`, `admin_idempotency_keys`, `pending_admin_actions`, `outbox_events`, `admin_inbox_items`, `incidents`
- **Envelope Pattern**: All admin endpoints return `{ok, data, meta?, requestId}`
- **Pagination**: Cursor-based (createdAt+id) with `meta.nextCursor`
- **Error Codes**: `AUTH_REQUIRED` (401 - no valid auth), `ADMIN_REQUIRED` (403 - authenticated but not admin), `RBAC_DENIED` (403 - missing permission), `NOT_FOUND` (404), `VALIDATION_ERROR` (400), `STATE_TRANSITION_INVALID` (400 - invalid state transition)
- **Middleware Stack**: `ensureRequestId` → `adminAuth` → `loadPermissions` → `requirePermission()`
- **Auth Hardening**: Uses OIDC claims in production (`req.user.claims.sub`), dev fallback via `x-replit-user-id` header
- **RBAC Cache**: 60-second TTL in-memory cache for permissions, invalidated via `invalidatePermissionsCache(adminUserId?)`
- **Audit Logging**: All mutations logged to `admin_audit_logs` with before/after JSON snapshots
- **Idempotency**: Mutations require `Idempotency-Key` header (min 8 chars), enforced via `requireIdempotencyKey` middleware
- **wrapMutation Helper**: Handles idempotency checks, audit logging, and error handling for all admin mutations
- **SuperAdmin Seeding**: Set `ADMIN_SUPER_EMAIL` env var; user must exist in DB, then `npm run db:seed` assigns super_admin role
- **Read-only Endpoints**: `/api/admin/me`, `/api/admin/users`, `/api/admin/users/:id`, `/api/admin/operations`, `/api/admin/operations/:id`, `/api/admin/inbox`, `/api/admin/incidents`, `/api/admin/incidents/:id`, `/api/admin/kyc/applicants`, `/api/admin/kyc/applicants/:id`
- **Mutation Endpoints**: `POST /api/admin/incidents` (create), `PATCH /api/admin/incidents/:id` (update with state transitions), `POST /api/admin/kyc/applicants/:id/decision` (approve/reject/needs-action/on-hold)
- **Incident State Machine**: DRAFT → [SCHEDULED, ACTIVE, CANCELLED], SCHEDULED → [ACTIVE, CANCELLED], ACTIVE → [RESOLVED]. Note: DRAFT → ACTIVE requires severity=critical OR `x-admin-step-up: true` header to prevent accidental activation.
- **KYC Queue Management**: Admin UI at `/admin/kyc` with list view, detail sheet, and decision dialog. Supports filtering by status, search by email/userId.
- **KYC Admin Transitions**: IN_REVIEW → [APPROVED, NEEDS_ACTION, REJECTED, ON_HOLD], ON_HOLD → [APPROVED, REJECTED]. All decisions require a reason and create audit logs.
- **KYC Permissions**: `kyc.read` (view applications), `kyc.review` (make decisions)
- **Withdrawals Queue Management**: Admin UI at `/admin/withdrawals` with list view, detail sheet, and 4-eyes approval workflow.
- **Withdrawals Table**: `withdrawals` table with 7 statuses: PENDING, APPROVED, PROCESSING, COMPLETED, FAILED, REJECTED, CANCELLED
- **4-Eyes (Maker-Checker) Pattern**: Uses `pendingAdminActions` table with `makerAdminUserId` and `checkerAdminUserId`. Maker creates approval request, different admin (checker) must approve. Same user cannot approve their own request.
- **Withdrawal State Machine**: PENDING → [APPROVED, REJECTED, CANCELLED], APPROVED → [PROCESSING, CANCELLED], PROCESSING → [COMPLETED, FAILED], FAILED → [PROCESSING]
- **Withdrawal Endpoints**: `GET /api/admin/withdrawals` (list), `GET /api/admin/withdrawals/:id` (detail), `POST /api/admin/withdrawals/:id/request-approval` (maker step), `POST /api/admin/pending-actions/:id/approve` (checker step), `POST /api/admin/withdrawals/:id/reject`, `POST /api/admin/withdrawals/:id/process` (mark processing/completed/failed)
- **Withdrawal Permissions**: `withdrawals.read` (view queue), `withdrawals.approve` (4-eyes approve/reject), `withdrawals.manage` (mark processing/completed/failed)
- **Files**: `server/admin/http.ts`, `server/admin/router.ts`, `server/admin/audit.ts`, `server/admin/middleware/*`, `shared/admin/dto.ts`, `client/src/pages/admin/kyc.tsx`, `client/src/pages/admin/withdrawals.tsx`, `server/lib/stateMachine/withdrawal.ts`

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