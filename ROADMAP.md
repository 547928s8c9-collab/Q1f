# ZEON WOW Roadmap

## Feature Status Overview

| # | Feature | Status | Routes/Endpoints | Key Files |
|---|---------|--------|-----------------|-----------|
| 1 | Inbox/Notifications 2.0 | DONE | `/inbox`, `/api/notifications` | `client/src/pages/inbox.tsx`, `client/src/components/notification-bell.tsx`, `client/src/lib/inbox-map.ts` |
| 2 | Statements | DONE | `/statements`, `/api/statements/summary`, `/api/statements/monthly` | `server/routes.ts`, `client/src/pages/statements.tsx` |
| 3 | Vault Goals | PARTIAL | `/api/vault/goal` | `shared/schema.ts` (vaults table), `client/src/pages/wallet/vaults.tsx` |
| 4 | Risk Controls | DONE | `/api/positions/:id/risk-controls`, `/api/positions/:id/pause` | `server/routes.ts`, `client/src/pages/invest/strategy-detail.tsx` |
| 5 | Status Page | NOT STARTED | - | - |
| 6 | Smart Start | NOT STARTED | - | - |

---

## Detailed Status

### 1. Inbox/Notifications 2.0 (DONE)

**Completed (WOW-01):**
- Centralized `inboxMap.ts` with type->icon/color/label mapping
- Icon circles per notification type (transaction, kyc, security, system, investment, risk)
- Enhanced card layout with type chips, unread indicators, timestamps
- Bell popover with top 5 notifications + "See all" button
- All/Unread filter tabs with unread count
- Mark as read (individual + bulk)
- CTA buttons with proper styling and navigation
- Loading skeleton, empty state ("All caught up"), error + retry
- Refresh button on inbox page

**Files:** `client/src/pages/inbox.tsx`, `client/src/components/notification-bell.tsx`, `client/src/lib/inbox-map.ts`

---

### 2. Statements (DONE)

**Completed (WOW-02):**
- Monthly PDF statement generation with pdfkit
- GET `/api/statements/summary?year=YYYY&month=MM` - returns summary JSON
- GET `/api/statements/monthly?year=YYYY&month=MM` - returns PDF download
- `/statements` page with month picker (last 12 months)
- Summary preview card (Total In, Total Out, Fees, Net Change)
- Download PDF button with loading state
- All UI states: loading skeleton, empty state, error + retry
- PDF includes header, period, summary box, operations table, footer
- CSV export still available at `/api/operations/export`

**Files:** `server/routes.ts`, `client/src/pages/statements.tsx`, `client/src/App.tsx`

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
| 2 | Status Page: Basic health + banners | Medium | Medium |
| 3 | Smart Start: Quiz + recommendations | Large | High |
| 4 | Inbox 2.0: Polish + grouping | Small | Medium |
