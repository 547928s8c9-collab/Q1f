# ZEON WOW Roadmap

## Feature Status Overview

| # | Feature | Status | Routes/Endpoints | Key Files |
|---|---------|--------|-----------------|-----------|
| 1 | Inbox/Notifications 2.0 | DONE | `/inbox`, `/api/notifications` | `client/src/pages/inbox.tsx`, `client/src/components/notification-bell.tsx`, `client/src/lib/inbox-map.ts` |
| 2 | Statements | DONE | `/statements`, `/api/statements/summary`, `/api/statements/monthly` | `server/routes.ts`, `client/src/pages/statements.tsx` |
| 3 | Vault Goals | DONE | `/api/vault/goal` | `shared/schema.ts`, `client/src/pages/wallet/vaults.tsx`, `client/src/components/vault/vault-card.tsx` |
| 4 | Risk Controls | DONE | `/api/positions/:id/risk-controls`, `/api/positions/:id/pause` | `server/routes.ts`, `client/src/pages/invest/strategy-detail.tsx` |
| 5 | Status Page | DONE | `/status`, `/api/status` | `server/routes.ts`, `client/src/pages/status.tsx`, `client/src/components/global-banner.tsx` |
| 6 | Smart Start | DONE | `/onboarding/smart-start`, `/onboarding/smart-start/results` | `client/src/lib/smart-start.ts`, `client/src/pages/onboarding/smart-start.tsx`, `client/src/pages/onboarding/smart-start-results.tsx` |

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

### 3. Vault Goals (DONE)

**Completed:**
- Schema fields: `goalName`, `goalAmount`, `autoSweepPct`, `autoSweepEnabled`
- Vault goal API: `POST /api/vault/goal`
- VaultData DTO includes progress calculation
- Basic goal editing dialog
- Milestones visualization (25/50/75/100% markers with checkmarks)
- Progress celebrations/toasts at milestone crossings
- Auto-sweep execution in payout job (ITER-3)

**Files:** `shared/schema.ts`, `server/routes.ts`, `client/src/pages/wallet/vaults.tsx`, `client/src/components/vault/vault-card.tsx`

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

### 5. Status Page (DONE)

**Completed (WOW-05):**
- GET `/api/status` - Config-based system status endpoint
- `/status` page showing overall status and component health
- Components: Deposits, Withdrawals, Investment Strategies, API Services
- Global banner integration: shows warnings when overall != "operational"
- Status configurable via env vars: SYSTEM_STATUS, SYSTEM_STATUS_MESSAGE, STATUS_*
- Auto-refresh every 30s on page, 60s for banner

**Files:** `server/routes.ts`, `client/src/pages/status.tsx`, `client/src/components/global-banner.tsx`

**Env Vars:**
- `SYSTEM_STATUS` - "operational" | "degraded" | "maintenance"
- `SYSTEM_STATUS_MESSAGE` - Custom message for banner
- `STATUS_DEPOSITS`, `STATUS_WITHDRAWALS`, `STATUS_STRATEGIES`, `STATUS_API` - Per-component status

---

### 6. Smart Start (DONE)

**Completed (WOW-06):**
- 3-question onboarding quiz: Risk Tolerance, Time Horizon, Investment Goal
- Rule-based recommendation engine with risk scoring (1-7)
- Profile labels: Safety-First Saver, Conservative Investor, Balanced Builder, Growth Investor, Aggressive Investor
- Suggested deposit amount based on profile (USDT)
- Strategy recommendations with allocation percentages
- Risk tier badges (LOW/CORE/HIGH) on recommendations
- localStorage persistence for answers
- Post-KYC integration: redirects to Smart Start after KYC approval
- "View Strategies" links to /invest catalog
- "Go to Dashboard" shortcut to home

**Files:** `client/src/lib/smart-start.ts`, `client/src/pages/onboarding/smart-start.tsx`, `client/src/pages/onboarding/smart-start-results.tsx`

---

## Recent Fixes

### ITER-1: KYC Source Consistency (DONE - Jan 2026)
- **Issue:** `complete-kyc` route only updated `securitySettings.kycStatus`, but bootstrap read from `kycApplicants` table
- **Fix:** Unified KYC status tracking to use `kycApplicants` table as single source of truth
- **Changes:**
  - Added `upsertKycApplicant()` method in storage for create-or-update pattern
  - Updated `start-kyc` route to upsert kycApplicant with status = "IN_REVIEW"
  - Updated `complete-kyc` route to upsert kycApplicant with status = "APPROVED"
  - Removed `securitySettings.kycStatus` fallback from bootstrap calculation
- **Files:** `server/storage.ts`, `server/routes.ts`

### ITER-2: Money Ops Audit Trail (DONE - Jan 2026)
- **Goal:** Add comprehensive audit logging for all financial operations
- **Coverage:**

| Route | Event | Fields Logged |
|-------|-------|---------------|
| `/api/deposit/usdt/simulate` | DEPOSIT_USDT | amountMinor, asset, idempotencyKey, requestId, ip |
| `/api/deposit/card/simulate` | DEPOSIT_CARD | amountMinor, asset, sourceAmount, sourceAsset, idempotencyKey, requestId, ip |
| `/api/invest` | INVEST | amountMinor, asset, strategyId, idempotencyKey, requestId, ip |
| `/api/withdraw/usdt` | WITHDRAW_USDT | amountMinor, feeMinor, asset, idempotencyKey, requestId, ip |
| `/api/vault/transfer` | VAULT_TRANSFER | amountMinor, asset, fromVault, toVault, idempotencyKey, requestId, ip |
| `/api/payout/daily` | DAILY_PAYOUT | amountMinor, asset, strategyId, requestId, ip |
| `/api/payout/daily` (auto-sweep) | VAULT_TRANSFER_AUTO_SWEEP | amountMinor, asset, fromVault, toVault, autoSweep, requestId, ip |

- **Privacy:** Wallet addresses excluded from audit details
- **Files:** `server/routes.ts`

### ITER-3: Vault Goals Milestones (DONE - Jan 2026)
- **Goal:** Add milestone markers (25/50/75/100%) on vault progress bar with celebration toasts
- **Implementation:**
  - Progress bar already shows milestone markers with checkmarks for reached milestones
  - Added celebration toast on milestone crossing (25%, 50%, 75%, 100%)
  - localStorage-based deduplication prevents toast spam (tracks last celebrated milestone per vault)
  - SSR-safe localStorage access with `typeof window` guard and try-catch
  - Initial render skips toast to prevent celebration on page load
- **Milestone Messages:**
  - 25%: "Great start! You're a quarter of the way there."
  - 50%: "Amazing progress! You've reached 50% of your goal."
  - 75%: "Almost there! Just a little more to go."
  - 100%: "Congratulations! You've reached your savings goal!"
- **Files:** `client/src/components/vault/vault-card.tsx`

### ITER-4: Idempotency Verification (DONE - Jan 2026)
- **Goal:** Verify all 5 money endpoints properly implement idempotency
- **Pattern:** All endpoints use `acquireIdempotencyLock()` and `completeIdempotency()` helpers
- **Idempotency Matrix:**

| Endpoint | Lock Location | Complete Location | E2E Verified |
|----------|---------------|-------------------|--------------|
| `/api/deposit/usdt/simulate` | Line 1026 | Line 1076 | ✓ |
| `/api/deposit/card/simulate` | Line 1092 | Line 1151 | ✓ |
| `/api/invest` | Line 1167 | Line 1283 | ✓ |
| `/api/withdraw/usdt` | Line 1413 | Line 1527 | ✓ |
| `/api/vault/transfer` | Line 1543 | Line 1640 | ✓ |

- **Behavior:**
  - First request: Inserts pending row, processes operation, caches response with operation.id
  - Duplicate request: Returns cached response with same operation.id (no balance duplication)
  - Missing key: Continues without idempotency (backward compatible)
- **E2E Test Results (NEXT-03 - Jan 2026):**

| Endpoint | Same Key Test | Different Keys Test | Balance Check |
|----------|---------------|---------------------|---------------|
| `/api/deposit/usdt/simulate` | ✓ same op.id | ✓ different op.ids | ✓ +1 not +2 |
| `/api/deposit/card/simulate` | ✓ same op.id | - | ✓ |
| `/api/invest` | ✓ same op.id | - | ✓ |
| `/api/withdraw/usdt` | Code verified | (requires 2FA) | - |
| `/api/vault/transfer` | ✓ same op.id | - | ✓ +1 not +2 |

- **Files:** `server/routes.ts` (lines 22-90 for helpers)

### NEXT-04: Financial Transaction Integrity (DONE - Jan 2026)
- **Goal:** Wrap critical money operations in atomic DB transactions to prevent partial state updates
- **Implementation:**
  - Added `withTransaction()` helper in `server/db.ts` using Drizzle's `db.transaction()`
  - Added `assertNonNegative()` invariant check for balance validation
  - All balance changes, position updates, operation records, and audit logs wrapped in single transaction
  
- **Endpoints Updated:**

| Endpoint | Transaction Scope | Invariant Check |
|----------|------------------|-----------------|
| `/api/invest` | balance + position + operation + audit | assertNonNegative(USDT balance) |
| `/api/withdraw/usdt` | balance + operation + audit | assertNonNegative(USDT balance) |
| `/api/vault/transfer` | source + dest + operation + audit | assertNonNegative(source balance/vault) |

- **Transaction Pattern:**
```typescript
const operation = await withTransaction(async (tx) => {
  // Re-fetch balance within transaction for consistency
  const [currentBalance] = await tx.select().from(balances).where(...);
  
  // Invariant check
  const newAvailable = BigInt(currentBalance.available) - BigInt(amount);
  assertNonNegative(newAvailable, "USDT balance");
  
  // Atomic updates using tx (not storage methods)
  await tx.update(balances).set({ available: newAvailable.toString() }).where(...);
  await tx.insert(operations).values({...}).returning();
  await tx.insert(auditLogs).values({...});
  
  return op;
});
```

- **Rollback Behavior:**
  - If any step throws, entire transaction rolls back (Drizzle auto-rollback)
  - INSUFFICIENT_BALANCE errors caught early, no balance mutation
  - INVARIANT_VIOLATION errors prevent negative balances from being committed

- **Files:** `server/db.ts`, `server/routes.ts`

---

## Next Iteration Recommendations

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Inbox 2.0: Grouping + polish | Small | Medium |
| 2 | Smart Start: One-click invest from results | Medium | Medium |
