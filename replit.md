# ZEON Fintech Dashboard

## Overview

ZEON is a production-grade fintech web dashboard MVP inspired by Revolut's structure with an Anthropic-style minimal design aesthetic. It provides portfolio management, investment strategies, wallet operations, activity tracking, and security settings for digital asset management.

The application handles cryptocurrency and fiat currency operations with USDT and RUB as primary assets, featuring real-time portfolio charts, investment strategy tracking, vault management, and comprehensive transaction history.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Charts**: Recharts for portfolio visualization, sparklines, and comparison charts
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Pattern**: RESTful JSON API with `/api` prefix
- **Development**: Vite dev server with HMR for frontend, tsx for server hot reloading

### Data Storage
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Database**: PostgreSQL (configured via DATABASE_URL environment variable)
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit for schema migrations (`drizzle-kit push`)

### Authentication
- **Replit Auth**: OIDC-based authentication via `server/replit_integrations/auth/index.ts`
- **User Schema**: Users managed via auth table in `shared/schema.ts`, types in `shared/models/auth.ts`
- **Protected Routes**: All API routes use `isAuthenticated` middleware and `getUserId(req)` to get user ID
- **User Initialization**: `storage.ensureUserData(userId)` creates default balances, vaults, and security settings for new users
- **Auth Endpoints**:
  - `GET /api/login` - Initiates OIDC login flow
  - `GET /api/logout` - Logs out user and redirects to landing page
  - `GET /api/auth/user` - Returns current user or 401 if not authenticated

### Onboarding Flow
New users must complete a 3-step onboarding process before accessing main app features:

1. **Verify Contact** (`/onboarding/verify`) - OTP verification via email (demo: any 6-digit code)
2. **Accept Consent** (`/onboarding/consent`) - Accept Terms of Service and Privacy Policy
3. **Complete KYC** (`/onboarding/kyc`) - Identity verification (demo: auto-approves after 2s)

**Stage Calculation**: The onboarding stage is computed from `securitySettings`:
- `contactVerified=false` → stage "verify"
- `consentAccepted=false` → stage "consent"  
- `kycStatus !== "approved"` → stage "kyc"
- All completed → stage "done"

**GateGuard Component**: Wraps `ProtectedRouter` and redirects users to appropriate onboarding step based on their current stage. Only users with stage "done" can access main app features.

**Onboarding API Endpoints** (all protected):
- `POST /api/onboarding/send-code` - Sends OTP (demo: always succeeds)
- `POST /api/onboarding/verify-code` - Verifies OTP (demo: accepts any 6-digit code)
- `POST /api/onboarding/accept-consent` - Records consent acceptance
- `POST /api/onboarding/start-kyc` - Starts KYC process
- `POST /api/onboarding/complete-kyc` - Completes KYC verification

**Component Organization**:
- `client/src/components/onboarding/` - Onboarding components (GateGuard, OnboardingLayout)
- `client/src/pages/onboarding/` - Onboarding page components (verify, consent, kyc, done)

### KYC State Machine
The KYC verification uses a 6-state machine with Sumsub integration (demo mode available):
- **NOT_STARTED**: Initial state, user hasn't begun verification
- **IN_REVIEW**: Documents submitted, pending provider review
- **APPROVED**: Verification complete, full access granted
- **NEEDS_ACTION**: Additional documents or info required
- **REJECTED**: Verification failed, user blocked from features
- **ON_HOLD**: Temporary hold for manual review

**Valid Transitions**:
- NOT_STARTED → IN_REVIEW (start verification)
- IN_REVIEW → APPROVED | NEEDS_ACTION | REJECTED | ON_HOLD
- NEEDS_ACTION → IN_REVIEW (resubmit)
- ON_HOLD → APPROVED | REJECTED

**KYC API Endpoints**:
- `GET /api/kyc/status` - Get current KYC state
- `POST /api/kyc/start` - Initiate verification (demo: auto-approves after 2s)
- `POST /api/sumsub/access-token` - Get Sumsub SDK token
- `POST /api/sumsub/webhook` - Handle Sumsub callbacks (uses providerRef lookup)
- `POST /api/sumsub/demo-callback` - Simulate status updates in demo mode

### Notifications System
Real-time notification system with bell icon in app shell:
- **NotificationBell Component**: Shows unread count badge, polls every 30s
- **Mark as Read**: Individual or bulk mark-all-read functionality
- **Notification Types**: transaction, security, kyc, system

**Notification API Endpoints**:
- `GET /api/notifications` - List notifications (supports ?unreadOnly=true)
- `GET /api/notifications/unread-count` - Get unread count for badge
- `POST /api/notifications/:id/read` - Mark single notification read
- `POST /api/notifications/read-all` - Mark all notifications read

### Activity Export
CSV export functionality for transaction history:
- Supports all filters from Activity UI (type, status, q)
- Endpoint: `GET /api/activity/export?filter=...&q=...`
- Returns CSV with headers: Date, Type, Status, Asset, Amount, Fee, etc.

### Monthly Statements
PDF statement generation with monthly summaries:
- `/statements` page with month picker (last 12 months)
- Summary preview card showing Total In, Total Out, Fees, Net Change
- Download PDF button with loading state

**Statement API Endpoints**:
- `GET /api/statements/summary?year=YYYY&month=MM` - Returns summary JSON (totals, counts)
- `GET /api/statements/monthly?year=YYYY&month=MM` - Returns PDF download

**PDF Contents**:
- Header with ZEON branding and statement period
- Summary box with Total In, Total Out, Fees, Net Change
- Operations table with Date, Type, Status, Asset, Amount columns
- Footer with generation timestamp

### Observability
Production-ready observability features:
- **Request ID Middleware**: UUID added to every request for tracing
- **Structured Logging**: All logs include requestId and metadata
- **Metrics Counters**: In-memory counters for requests, operations, errors
- **Metrics Endpoint**: `GET /api/metrics` (requires METRICS_SECRET header in production)

### Investment & Payout System

**Strategy Catalog**:
- 8 investment strategies with risk tiers (LOW/CORE/HIGH)
- 90-day demo performance data with benchmark comparisons (BTC/ETH/INDEX)
- Strategy detail pages with compare charts and demo calculator

**Position Tracking** (positions table):
- `principalMinor`: Original investment amount
- `investedCurrentMinor`: Current value including accrued gains
- `accruedProfitPayableMinor`: Accumulated profit available for payout
- `lastAccrualDate`: Date of last daily return accrual

**Payout Instructions** (payout_instructions table):
- Per-strategy payout configuration
- Frequency: DAILY or MONTHLY
- Requires active whitelisted address to activate
- `minPayoutMinor`: Minimum amount before payout executes

**Redemption Requests** (redemption_requests table):
- Status: PENDING → EXECUTED or CANCELLED
- Weekly execution window (Sundays 00:00 UTC)
- Supports partial or full principal redemption

**Operation Types**:
- PROFIT_ACCRUAL: Daily return applied to position
- PROFIT_PAYOUT: Profit withdrawn to whitelisted address
- PRINCIPAL_REDEEM_EXECUTED: Principal returned to wallet

**Job Routes** (dev triggers, protect in production):
- `POST /api/jobs/accrue-daily`: Apply daily strategy returns based on expectedMonthlyRange
- `POST /api/jobs/payout-run?frequency=DAILY|MONTHLY`: Execute payouts (deducts 1 USDT network fee)
- `POST /api/jobs/redemption-weekly-run`: Execute due redemption requests

**Payout API Endpoints**:
- `GET /api/payout-instructions` - List user's payout instructions
- `GET /api/payout-instructions/:strategyId` - Get specific instruction
- `POST /api/payout-instructions` - Create/update payout configuration

**Redemption API Endpoints**:
- `GET /api/redemptions` - List user's redemption requests (includes next window)
- `POST /api/redemptions` - Request principal redemption

### Vault Goals System

**Schema Fields** (vaults table):
- `goalName`: Optional display name for the savings goal (max 50 chars)
- `goalAmount`: Target amount in minor units (string)
- `autoSweepPct`: Percentage of profit to auto-sweep (0-100)
- `autoSweepEnabled`: Whether auto-sweep is active for this vault

**VaultData DTO** (in BootstrapResponse):
- `balance`: Current vault balance
- `goalName`, `goalAmount`, `autoSweepPct`, `autoSweepEnabled`: Goal settings
- `progress`: Calculated progress percentage (0-100), using BigInt math for precision

**Vault Goal API Endpoints**:
- `POST /api/vault/goal` - Update vault goal settings
  - Body: `{ type: "principal"|"profit"|"taxes", goalName?, goalAmount?, autoSweepPct?, autoSweepEnabled? }`
  - goalAmount must be a numeric string (minor units) or null

**UI Components**:
- VaultCard: Shows progress bar when goal is set, displays goal name and auto-sweep info
- Goal dialog: Edit goal name, target amount, and per-vault auto-sweep percentage (0-100% slider)

### Key Design Decisions

**Multi-User Architecture**: All data is scoped to authenticated users. User ID is obtained from `req.user.claims.sub` in authenticated routes. New users are automatically initialized with default balances, vaults, and security settings on first login.

**Money Handling**: All monetary amounts are stored as strings representing integer minor units (never floats). USDT uses 6 decimal places, RUB uses 2 decimal places. This prevents floating-point precision errors in financial calculations.

**Shared Schema**: The `shared/` directory contains schema definitions and types used by both frontend and backend, ensuring type safety across the stack.

**Database Storage**: The `server/storage.ts` implements a `DatabaseStorage` class using Drizzle ORM for all data persistence. The `server/db.ts` establishes the PostgreSQL connection.

**Operation-Driven Flow**: All money actions (deposits, withdrawals, investments, vault transfers) create Operation records with proper status transitions. The Activity page reads exclusively from the operations table.

**Bootstrap Endpoint**: `/api/bootstrap` is the single source of truth for balances, vaults, invested amounts, portfolio series, quotes, and gate flags. Frontend pages use this endpoint rather than hardcoded values.

**Component Organization**: 
- `client/src/components/ui/` - Reusable shadcn/ui components and custom primitives
- `client/src/components/charts/` - Chart components (portfolio, sparkline, compare)
- `client/src/components/operations/` - Transaction-related components
- `client/src/pages/` - Route-level page components

**Custom UI Primitives** (Revolut-inspired design):
- `Money` - Formatted currency display with size variants (xs/sm/md/lg/xl/2xl), tabular nums, semantic colors
- `SectionHeader` - Page section titles with optional subtitle and action slot
- `Chip` - Status/category badges with variants (default/success/warning/danger/primary/outline)
- `IconButton` - Standardized icon-only buttons with size variants
- `Skeleton` / `SkeletonCard` / `SkeletonTable` - Loading state components
- `EmptyState` - Empty list/error states with icon, title, description, and action

**Path Aliases**: 
- `@/` maps to `client/src/`
- `@shared/` maps to `shared/`
- `@assets/` maps to `attached_assets/`

## External Dependencies

### Database
- **PostgreSQL**: Primary database via `DATABASE_URL` environment variable
- **Drizzle ORM**: Database access and schema management
- **connect-pg-simple**: PostgreSQL session store for Express

### UI Framework
- **Radix UI**: Headless component primitives (dialog, dropdown, tabs, etc.)
- **shadcn/ui**: Pre-styled component library built on Radix
- **Tailwind CSS**: Utility-first styling
- **Lucide React**: Icon library (18px for normal buttons, 16px for small)

### Data & State
- **TanStack React Query**: Server state management and caching
- **Zod**: Schema validation for API requests and form data
- **drizzle-zod**: Zod schema generation from Drizzle tables

### Charts
- **Recharts**: Charting library for portfolio performance, sparklines, and comparison charts
- **embla-carousel-react**: Carousel functionality

### Development
- **Vite**: Frontend build tool and dev server
- **tsx**: TypeScript execution for server
- **esbuild**: Production bundling for server code