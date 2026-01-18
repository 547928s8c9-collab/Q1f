# ZEON Admin Console — Development Plan

## Status Overview

### Already Implemented (Stages C–E)

| Stage | What's Done |
|-------|-------------|
| **C** | RBAC tables (`admin_users`, `roles`, `permissions`, `role_permissions`, `admin_user_roles`), audit (`admin_audit_logs`), idempotency (`admin_idempotency_keys`), 4-eyes (`pending_admin_actions`), outbox (`outbox_events`), inbox (`admin_inbox_items`), incidents (`incidents`) |
| **D** | Read-only API: `/api/admin/me`, `/api/admin/users`, `/api/admin/users/:id`, `/api/admin/operations`, `/api/admin/operations/:id`, `/api/admin/inbox` with envelope pattern `{ok, data, meta?, requestId}`, cursor pagination, RBAC middleware |
| **E** | Admin UI shell: `/admin` layout with sidebar, Dashboard, Users list, Operations list, Inbox list pages |
| **Canonical** | Shared `acceptConsentCanonical()` and `startKycCanonical()` functions in `server/routes.ts` |

---

## Slice Roadmap (S1–S8)

---

### S1: Foundation Polish

**Goal:** Harden RBAC enforcement, wire audit logging to all admin actions, ensure `/admin/me` returns complete role/permission data.

**DB Changes:**
- None (tables exist)

**API Endpoints:**
- `GET /api/admin/me` — enrich with `permissions[]` array
- `GET /api/admin/roles` — list all roles (read-only)
- `GET /api/admin/permissions` — list all permissions (read-only)

**UI Pages/Components:**
- `/admin` — sidebar shows current user role badge
- Toast on 403 errors with "Access Denied" message

**DoD:**
- [ ] `/api/admin/me` returns `{ id, email, roles: [...], permissions: [...] }`
- [ ] All existing admin endpoints log to `admin_audit_logs` on success
- [ ] 403 responses include `{ error: { code: "RBAC_DENIED", requiredPermission } }`
- [ ] Sidebar displays role badge from `/me` response
- [ ] Unit tests: RBAC middleware denies missing permission
- [ ] Integration test: audit log row created after GET /users

**Edge Cases:**
- User has multiple roles → permissions merged, no duplicates
- Deleted admin user → 401 on next request
- Missing `Authorization` header → 401 not 500
- Super-long permission list → response still under 50KB

---

### S2: Users & Access UI

**Goal:** Admin can view user list, user detail, and manage admin roles (assign/revoke).

**DB Changes:**
- None

**API Endpoints:**
- `GET /api/admin/users` — already exists, add filters: `?status=`, `?search=`
- `GET /api/admin/users/:id` — already exists
- `POST /api/admin/users/:id/roles` — assign role (requires `manage_roles`)
- `DELETE /api/admin/users/:id/roles/:roleId` — revoke role

**UI Pages/Components:**
- `/admin/users` — table with search, status filter, pagination
- `/admin/users/:id` — detail drawer/modal: balances, KYC status, roles
- Role assignment dropdown (SuperAdmin only)

**DoD:**
- [ ] Users table shows: email, KYC status, created, roles
- [ ] Search by email substring works
- [ ] Filter by KYC status (NOT_STARTED, IN_REVIEW, APPROVED, REJECTED)
- [ ] User detail shows balances, vaults, positions summary
- [ ] Role assign/revoke creates audit log entry
- [ ] Only `manage_roles` permission allows POST/DELETE roles

**Edge Cases:**
- Assign role to self → allowed only for SuperAdmin
- Revoke last SuperAdmin → blocked with error
- User not found → 404 with `NOT_FOUND` code
- Concurrent role changes → last-write-wins (no optimistic locking)

---

### S3: KYC Queue

**Goal:** Compliance admin can view pending KYC applications, approve/reject with reason, audit trail.

**DB Changes:**
- None (uses `kycApplicants` table)

**API Endpoints:**
- `GET /api/admin/kyc` — list applicants with `?status=IN_REVIEW` default
- `GET /api/admin/kyc/:userId` — applicant detail
- `POST /api/admin/kyc/:userId/decision` — `{ decision: "APPROVED"|"REJECTED"|"NEEDS_ACTION", reason? }`

**UI Pages/Components:**
- `/admin/kyc` — queue table: user, submitted, level, status
- `/admin/kyc/:userId` — detail panel with documents placeholder, decision form
- Decision confirmation modal with reason textarea

**DoD:**
- [ ] Queue shows only IN_REVIEW by default, filter dropdown for other statuses
- [ ] Decision endpoint validates state transition via `KycTransitions`
- [ ] Audit log records `KYC_ADMIN_DECISION` with admin userId, reason
- [ ] Notification sent to user on decision
- [ ] SecuritySettings updated on APPROVED
- [ ] Requires `manage_kyc` permission

**Edge Cases:**
- Double-submit decision → idempotent if same decision, 400 if different
- User already APPROVED → 400 "Invalid transition"
- Empty reason on REJECTED → 400 validation error
- Concurrent decisions by two admins → first wins, second gets 400

---

### S4: Withdrawals Queue + 4-Eyes

**Goal:** Ops admin can view pending withdrawals, approve/reject with 4-eyes (two different admins required for amounts > threshold).

**DB Changes:**
- Add `admin_approval_threshold_minor` to config or env (e.g., 1000 USDT = 1000000000)

**API Endpoints:**
- `GET /api/admin/withdrawals` — list pending operations type=WITHDRAW_USDT
- `GET /api/admin/withdrawals/:id` — operation detail
- `POST /api/admin/withdrawals/:id/approve` — first approval or execute
- `POST /api/admin/withdrawals/:id/reject` — reject with reason

**UI Pages/Components:**
- `/admin/withdrawals` — queue table: user, amount, address, status, approvals
- `/admin/withdrawals/:id` — detail with approval history
- Approve/Reject buttons with confirmation

**DoD:**
- [ ] Withdrawals over threshold require 2 approvals from different admins
- [ ] `pending_admin_actions` tracks first approval
- [ ] Second approval executes withdrawal (updates balance, operation status)
- [ ] Reject clears pending action, refunds locked balance
- [ ] Audit log records each approval/rejection with admin ID
- [ ] Requires `approve_withdrawals` permission

**Edge Cases:**
- Same admin tries to approve twice → 400 "Already approved by you"
- Withdrawal cancelled by user before second approval → 400 "Operation cancelled"
- Network failure during execute → operation marked FAILED, balance restored
- Amount changed after first approval → 400 "Amount mismatch"

---

### S5: Corrections + Step-Up + Idempotency

**Goal:** Support admin can create correction operations (credit/debit) with step-up confirmation and idempotency.

**DB Changes:**
- None (uses `operations`, `admin_idempotency_keys`)

**API Endpoints:**
- `POST /api/admin/corrections` — create correction `{ userId, asset, amountMinor, type: "CREDIT"|"DEBIT", reason }`
- `GET /api/admin/corrections` — list correction operations
- `GET /api/admin/corrections/:id` — detail

**UI Pages/Components:**
- `/admin/corrections` — list of correction operations
- `/admin/corrections/new` — form: user search, asset, amount, type, reason
- Step-up modal: re-enter password or 2FA before submit

**DoD:**
- [ ] Idempotency-Key header required, returns cached response on duplicate
- [ ] Correction creates operation with type=CORRECTION_CREDIT or CORRECTION_DEBIT
- [ ] Balance updated atomically with operation creation
- [ ] Audit log records correction with full details
- [ ] Step-up confirmation required (re-auth or PIN)
- [ ] Requires `create_corrections` permission

**Edge Cases:**
- Negative balance after DEBIT → 400 "Insufficient balance"
- Duplicate Idempotency-Key with different body → 400 "Key already used"
- User not found → 404
- Step-up timeout → return to form, preserve input

---

### S6: Strategies Viewer

**Goal:** Admin can view strategy catalog and user positions (read-only).

**DB Changes:**
- None

**API Endpoints:**
- `GET /api/admin/strategies` — list all strategies with stats
- `GET /api/admin/strategies/:id` — strategy detail with aggregate positions
- `GET /api/admin/positions` — list positions across users `?strategyId=`

**UI Pages/Components:**
- `/admin/strategies` — table: name, risk tier, total AUM, active positions count
- `/admin/strategies/:id` — detail with position breakdown chart

**DoD:**
- [ ] Strategies show aggregate investedCurrentMinor across all positions
- [ ] Positions list supports pagination, filter by strategy
- [ ] All endpoints read-only, no mutations
- [ ] Requires `view_strategies` permission

**Edge Cases:**
- Strategy with 0 positions → show "No active positions"
- Deleted user's positions → still visible with "User deleted" badge

---

### S7: Incidents & Status Page

**Goal:** Ops admin can create/publish/resolve incidents, schedule maintenance windows, and manage status page banners.

**DB Changes:**
- None (uses `incidents` table)

**API Endpoints:**
- `GET /api/admin/incidents` — list all incidents
- `POST /api/admin/incidents` — create incident `{ title, message, severity, affectedComponents[], scheduledAt? }`
- `PATCH /api/admin/incidents/:id` — update status (active/resolved), message
- `DELETE /api/admin/incidents/:id` — delete draft incident

**UI Pages/Components:**
- `/admin/incidents` — list: title, severity, status, created, resolved
- `/admin/incidents/new` — create form with component checkboxes
- `/admin/incidents/:id` — edit form, resolve button
- Banner preview component

**DoD:**
- [ ] Create incident with severity (info/warning/critical)
- [ ] affectedComponents from enum: deposits, withdrawals, strategies, api
- [ ] scheduledAt for maintenance windows (future time)
- [ ] Resolve updates resolvedAt timestamp
- [ ] Public `/api/status` reflects active incidents
- [ ] Requires `manage_incidents` permission

**Edge Cases:**
- Resolve already-resolved incident → idempotent, no error
- Delete active incident → 400 "Resolve before deleting"
- scheduledAt in past → 400 validation error
- Multiple active critical incidents → all shown on status page

---

### S8: Statements/Exports + Audit Browser

**Goal:** Admin can generate CSV exports of operations/users, view monthly statement jobs, and search audit logs.

**DB Changes:**
- Optional: `export_jobs` table for async exports (or use outbox)

**API Endpoints:**
- `POST /api/admin/exports` — create export job `{ type: "operations"|"users"|"audit", filters }`
- `GET /api/admin/exports` — list export jobs with download URLs
- `GET /api/admin/exports/:id/download` — download file
- `GET /api/admin/audit-logs` — search audit logs `?event=&userId=&from=&to=`

**UI Pages/Components:**
- `/admin/exports` — list jobs: type, status, created, download link
- `/admin/exports/new` — form: type dropdown, date range, filters
- `/admin/audit` — search form + results table
- Download button triggers file download

**DoD:**
- [ ] Export job queued, status: pending → processing → completed
- [ ] Completed job has downloadUrl (signed, expires in 1h)
- [ ] Audit search supports: event type, userId, date range
- [ ] Audit results show: timestamp, event, actor, resource, details preview
- [ ] Large exports (>10k rows) processed async
- [ ] Requires `create_exports` and `view_audit` permissions

**Edge Cases:**
- Export with 0 results → completed with empty file
- Download expired link → 410 Gone
- Concurrent exports → queue, process sequentially
- Audit search no results → show "No matching logs"

---

## Priority Order

| Priority | Slice | Rationale |
|----------|-------|-----------|
| P0 | S1 Foundation | Required for all other slices |
| P1 | S3 KYC Queue | Critical compliance path |
| P1 | S4 Withdrawals | Critical money movement |
| P2 | S2 Users & Access | Admin management |
| P2 | S5 Corrections | Support operations |
| P3 | S6 Strategies | Read-only, lower risk |
| P3 | S7 Incidents | Operational visibility |
| P4 | S8 Exports | Nice-to-have, compliance |

---

## Dependencies

```
S1 Foundation
 ├── S2 Users (needs /me permissions)
 ├── S3 KYC (needs audit wiring)
 └── S4 Withdrawals (needs RBAC)
      └── S5 Corrections (needs idempotency pattern from S4)

S6, S7, S8 are independent of S2–S5
```

---

## Versioning

- API version: `v1` (implicit in `/api/admin/*`)
- Breaking changes: bump to `v2` with deprecation period
- Schema migrations: use `npm run db:push --force`
