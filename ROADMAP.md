# ZEON WOW Roadmap

## Feature Status Overview

| # | Feature | Status | Routes/Endpoints | Key Files |
|---|---------|--------|-----------------|-----------|
| 1 | Inbox/Notifications 2.0 | PARTIAL | `/inbox`, `/api/notifications` | `client/src/pages/inbox.tsx`, `client/src/components/notifications/notification-bell.tsx` |
| 2 | Statements | PARTIAL | `/api/operations/export` (CSV only) | `server/routes.ts` (line 353) |
| 3 | Vault Goals | PARTIAL | `/api/vault/goal` | `shared/schema.ts` (vaults table), `client/src/pages/wallet/vaults.tsx` |
| 4 | Risk Controls | DONE | `/api/positions/:id/risk-controls`, `/api/positions/:id/pause` | `server/routes.ts`, `client/src/pages/invest/strategy-detail.tsx` |
| 5 | Status Page | NOT STARTED | - | - |
| 6 | Smart Start | NOT STARTED | - | - |

---

## Detailed Status

### 1. Inbox/Notifications 2.0 (PARTIAL)

**Done:**
- Basic inbox page with card-based notifications
- Type badges (transaction, kyc, security, system)
- All/Unread filter tabs
- Mark as read (individual + bulk)
- CTA routing with `ctaPath` + `ctaLabel`
- Bell icon with unread count badge (polls every 30s)
- Loading skeleton + empty state

**Missing:**
- Visual polish (icons per type, richer card layout)
- "Next step" CTA prominence
- Grouping by date
- Rich notification types (investment payouts, DD breach, etc.)

**Files:** `client/src/pages/inbox.tsx`, `client/src/components/notifications/notification-bell.tsx`, `server/routes.ts`

---

### 2. Statements (PARTIAL)

**Done:**
- CSV export endpoint at `GET /api/operations/export`
- Supports filters (type, status, search)

**Missing:**
- Monthly PDF statement generation
- Summary section (total fees, P&L)
- Statement history page
- Download UI in Activity page

**Files:** `server/routes.ts` (line 353+)

---

### 3. Vault Goals (PARTIAL)

**Done:**
- Schema fields: `goalName`, `goalAmount`, `autoSweepPct`, `autoSweepEnabled`
- Vault goal API: `POST /api/vault/goal`
- VaultData DTO includes progress calculation
- Basic goal editing dialog

**Missing:**
- Milestones visualization
- Auto-sweep execution in payout job
- Progress celebrations/toasts

**Files:** `shared/schema.ts`, `server/routes.ts`, `client/src/pages/wallet/vaults.tsx`

---

### 4. Risk Controls (DONE)

**Completed features:**
- Position-specific risk settings (paused, ddLimitPct, autoPauseEnabled)
- Pause/Resume toggle with audit logging
- DD limit slider (0-50%)
- Auto-pause on DD breach with notification
- Paused positions block new investments
- Daily accrue job skips paused positions

**Files:** `shared/schema.ts` (positions table), `server/routes.ts`, `client/src/pages/invest/strategy-detail.tsx`

**Endpoints:**
- `GET /api/positions/:strategyId/risk-controls`
- `POST /api/positions/:strategyId/risk-controls`
- `POST /api/positions/:strategyId/pause`

---

### 5. Status Page (NOT STARTED)

**Planned:**
- `/status` page showing system health
- Maintenance mode banners (app-wide)
- Optional incident history
- Admin controls for status updates

---

### 6. Smart Start (NOT STARTED)

**Planned:**
- 3-question onboarding quiz (risk tolerance, time horizon, amount)
- Strategy recommendation engine
- Suggested investment amount/split
- "Quick plan" summary with one-click invest

---

## Next Iteration Recommendations

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Vault Goals: Auto-sweep execution | Small | High |
| 2 | Statements: PDF generation + UI | Medium | High |
| 3 | Status Page: Basic health + banners | Medium | Medium |
| 4 | Smart Start: Quiz + recommendations | Large | High |
| 5 | Inbox 2.0: Polish + grouping | Small | Medium |
