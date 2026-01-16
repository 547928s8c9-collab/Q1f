# Admin Console Spec v1

> ZEON Fintech Platform — Admin Console Specification  
> Version: 1.0  
> Date: January 2026

---

## A) Goals & Non-Goals

### Goals

1. **User Management** — View, search, and manage platform users; access user profiles, balances, positions, and activity history
2. **KYC/Compliance** — Review KYC submissions, approve/reject/request-action, track compliance backlog
3. **Money Operations** — Read-only ledger view, approve pending withdrawals, create correction operations with audit trail
4. **Vault Management** — View vault states, manage auto-sweep settings, override goal configurations
5. **Strategy Management** — Pause/resume strategies, adjust risk limits, manage visibility and eligibility
6. **Trading Sessions (Simulation)** — Monitor sim_sessions, view events, handle failed sessions
7. **Incidents & Status** — Publish/schedule status banners, manage incidents lifecycle
8. **Exports & Reports** — Generate CSV exports, monthly statements, compliance reports
9. **Access Control (RBAC)** — Manage admin roles and permissions
10. **Audit Visibility** — Full audit log access for compliance and debugging

### Non-Goals

1. **No refactoring of server/routes.ts** — Admin API will be separate (`/api/admin/*`)
2. **No changes to existing money flow logic** — Admin actions create new operations, never mutate directly
3. **No user-facing features** — This spec covers admin-only functionality
4. **No live trading integration** — sim_sessions remain simulation-only, no real exchange connections

---

## B) Information Architecture (Nav Map)

### Navigation Structure

```
/admin
├── /admin/dashboard              # Overview metrics, alerts, quick actions
│
├── Users & KYC
│   ├── /admin/users              # User list with search/filter
│   ├── /admin/users/:id          # User detail (profile, balances, positions, ops)
│   ├── /admin/kyc                # KYC queue (pending reviews)
│   └── /admin/kyc/:id            # KYC review detail
│
├── Money
│   ├── /admin/operations         # Operations ledger (read-only)
│   ├── /admin/operations/:id     # Operation detail
│   ├── /admin/withdrawals        # Withdrawal approval queue
│   └── /admin/corrections        # Correction operations log
│
├── Vaults & Goals
│   └── /admin/vaults             # Vault overview, auto-sweep config
│
├── Strategies
│   ├── /admin/strategies         # Strategy list with controls
│   └── /admin/strategies/:id     # Strategy detail, risk settings
│
├── Trading Sessions
│   ├── /admin/sim-sessions       # Simulation session list
│   └── /admin/sim-sessions/:id   # Session detail, events, controls
│
├── Notifications
│   └── /admin/inbox              # Admin action queue (pending items)
│
├── Incidents & Status
│   ├── /admin/incidents          # Incident list
│   ├── /admin/incidents/new      # Create incident
│   └── /admin/status             # Status page config
│
├── Compliance
│   ├── /admin/audit              # Audit log viewer
│   └── /admin/exports            # Export generation
│
└── Access Control
    ├── /admin/roles              # Role management
    └── /admin/permissions        # Permission matrix
```

### Nav Groups

| Group | Pages | Icon |
|-------|-------|------|
| Overview | Dashboard | LayoutDashboard |
| Users & KYC | Users, KYC Queue | Users, Shield |
| Money | Operations, Withdrawals, Corrections | Wallet, ArrowUpRight |
| Assets | Vaults, Strategies | Vault, TrendingUp |
| Sessions | Trading Sessions | Play |
| Ops | Inbox, Incidents, Status | Bell, AlertTriangle |
| Compliance | Audit, Exports | FileSearch, Download |
| Access | Roles, Permissions | Lock |

---

## C) Roles & Permissions (RBAC)

### Roles

| Role | Description | Typical Use |
|------|-------------|-------------|
| SuperAdmin | Full platform access | Engineering leads, founders |
| Ops | Operations management | Ops team, on-call |
| Compliance | KYC/AML, audit access | Compliance officers |
| Support | User support, read-heavy | Customer support |
| ReadOnly | View-only access | Auditors, observers |

### Permissions (Granular)

| Domain | Permission | Description |
|--------|------------|-------------|
| **Users** | users.read | View user profiles and data |
| | users.write | Modify user settings (non-money) |
| | users.suspend | Suspend/unsuspend user accounts |
| **KYC** | kyc.read | View KYC submissions |
| | kyc.review | Approve/reject/request-action KYC |
| **Money** | money.read | View operations ledger |
| | money.approve_withdrawal | Approve pending withdrawals |
| | money.create_correction | Create correction operations |
| | money.vault_override | Override vault settings |
| **Strategies** | strategies.read | View strategies |
| | strategies.pause | Pause/resume strategies |
| | strategies.risk_limits | Modify risk limits (ddLimitPct, etc.) |
| | strategies.visibility | Change strategy visibility/eligibility |
| **Sim Sessions** | sim.read | View simulation sessions |
| | sim.control | Start/stop/cancel sessions |
| **Incidents** | incidents.read | View incidents |
| | incidents.publish | Create/publish incidents |
| | incidents.resolve | Resolve incidents |
| **Exports** | exports.generate | Generate CSV/PDF exports |
| **Audit** | audit.read | View audit logs |
| **Access** | access.read | View roles and permissions |
| | access.manage | Modify roles and permissions |
| **Config** | config.read | View feature flags and settings |
| | config.write | Modify feature flags and settings |

### Role → Permission Matrix

| Permission | SuperAdmin | Ops | Compliance | Support | ReadOnly |
|------------|:----------:|:---:|:----------:|:-------:|:--------:|
| users.read | ✓ | ✓ | ✓ | ✓ | ✓ |
| users.write | ✓ | ✓ | - | ✓ | - |
| users.suspend | ✓ | ✓ | - | - | - |
| kyc.read | ✓ | ✓ | ✓ | ✓ | ✓ |
| kyc.review | ✓ | - | ✓ | - | - |
| money.read | ✓ | ✓ | ✓ | ✓ | ✓ |
| money.approve_withdrawal | ✓ | ✓ | - | - | - |
| money.create_correction | ✓ | - | - | - | - |
| money.vault_override | ✓ | ✓ | - | - | - |
| strategies.read | ✓ | ✓ | ✓ | ✓ | ✓ |
| strategies.pause | ✓ | ✓ | - | - | - |
| strategies.risk_limits | ✓ | ✓ | - | - | - |
| strategies.visibility | ✓ | ✓ | - | - | - |
| sim.read | ✓ | ✓ | ✓ | ✓ | ✓ |
| sim.control | ✓ | ✓ | - | - | - |
| incidents.read | ✓ | ✓ | ✓ | ✓ | ✓ |
| incidents.publish | ✓ | ✓ | - | - | - |
| incidents.resolve | ✓ | ✓ | - | - | - |
| exports.generate | ✓ | ✓ | ✓ | - | - |
| audit.read | ✓ | ✓ | ✓ | - | ✓ |
| access.read | ✓ | - | - | - | - |
| access.manage | ✓ | - | - | - | - |
| config.read | ✓ | ✓ | - | - | - |
| config.write | ✓ | - | - | - | - |

---

## D) Sensitive Actions Matrix

### Money Domain

| Action | Permissions | Audit | Idempotency | 4-Eyes | Step-Up |
|--------|-------------|:-----:|:-----------:|:------:|:-------:|
| Approve withdrawal | money.approve_withdrawal | ✓ | ✓ | ✓ (>$10k) | ✓ |
| Decline withdrawal | money.approve_withdrawal | ✓ | ✓ | - | - |
| Create correction operation | money.create_correction | ✓ | ✓ | ✓ | ✓ |
| Override vault balance | money.vault_override | ✓ | ✓ | ✓ | ✓ |
| Change auto-sweep % | money.vault_override | ✓ | - | - | - |
| Enable/disable auto-sweep | money.vault_override | ✓ | - | - | - |

### KYC Domain

| Action | Permissions | Audit | Idempotency | 4-Eyes | Step-Up |
|--------|-------------|:-----:|:-----------:|:------:|:-------:|
| Approve KYC | kyc.review | ✓ | ✓ | - | - |
| Reject KYC | kyc.review | ✓ | ✓ | - | ✓ |
| Request additional docs | kyc.review | ✓ | - | - | - |
| Put KYC on hold | kyc.review | ✓ | - | - | - |

### Strategy Domain

| Action | Permissions | Audit | Idempotency | 4-Eyes | Step-Up |
|--------|-------------|:-----:|:-----------:|:------:|:-------:|
| Pause strategy | strategies.pause | ✓ | ✓ | - | - |
| Resume strategy | strategies.pause | ✓ | ✓ | - | - |
| Change risk limits | strategies.risk_limits | ✓ | - | - | - |
| Change visibility | strategies.visibility | ✓ | - | - | - |

### Incidents Domain

| Action | Permissions | Audit | Idempotency | 4-Eyes | Step-Up |
|--------|-------------|:-----:|:-----------:|:------:|:-------:|
| Publish incident | incidents.publish | ✓ | ✓ | - | - |
| Resolve incident | incidents.resolve | ✓ | ✓ | - | - |

### Access Domain

| Action | Permissions | Audit | Idempotency | 4-Eyes | Step-Up |
|--------|-------------|:-----:|:-----------:|:------:|:-------:|
| Create/modify role | access.manage | ✓ | ✓ | ✓ | ✓ |
| Assign role to admin | access.manage | ✓ | ✓ | - | ✓ |
| Remove admin access | access.manage | ✓ | ✓ | ✓ | ✓ |

---

## E) State Machines

### E.1 KYC Status (Existing)

```
           ┌──────────────────────────────────────────┐
           │                                          │
           v                                          │
    NOT_STARTED ────► IN_REVIEW ────► APPROVED        │
                          │               (terminal)  │
                          │                           │
                          ├────► NEEDS_ACTION ────────┘
                          │           │
                          │           └───► IN_REVIEW (resubmit)
                          │
                          ├────► REJECTED (terminal)
                          │
                          └────► ON_HOLD ────► IN_REVIEW
                                      │
                                      └────► REJECTED
```

**Transitions:**
| From | To | Trigger |
|------|-----|---------|
| NOT_STARTED | IN_REVIEW | User submits documents |
| IN_REVIEW | APPROVED | Admin approves |
| IN_REVIEW | NEEDS_ACTION | Admin requests more info |
| IN_REVIEW | REJECTED | Admin rejects |
| IN_REVIEW | ON_HOLD | Admin puts on hold |
| NEEDS_ACTION | IN_REVIEW | User resubmits |
| ON_HOLD | IN_REVIEW | Admin resumes review |
| ON_HOLD | REJECTED | Admin rejects from hold |

### E.2 Withdrawal Status (NEW)

```
    PENDING ────► APPROVED ────► PROCESSING ────► COMPLETED
        │              │               │
        │              │               └────► FAILED
        │              │
        └────► DECLINED (terminal)
        │
        └────► CANCELLED (terminal, user-initiated)
```

**Proposed Statuses:**
| Status | Description |
|--------|-------------|
| PENDING | Awaiting admin approval |
| APPROVED | Admin approved, queued for processing |
| PROCESSING | Broadcasting to network |
| COMPLETED | Successfully sent |
| FAILED | Network/processing error |
| DECLINED | Admin rejected |
| CANCELLED | User cancelled before approval |

### E.3 Incident/Status Banner (NEW)

```
    DRAFT ────► SCHEDULED ────► ACTIVE ────► RESOLVED
                    │                            │
                    │                            └────► archived
                    │
                    └────► CANCELLED
```

**Proposed Statuses:**
| Status | Description |
|--------|-------------|
| DRAFT | Created but not published |
| SCHEDULED | Scheduled for future activation |
| ACTIVE | Currently visible to users |
| RESOLVED | Issue resolved, banner removed |
| CANCELLED | Removed without resolution |

### E.4 Strategy Control State (NEW)

```
    ACTIVE ◄────► PAUSED
      │              │
      │              └── pausedReason: manual | dd_breach | risk_limit
      │
      └── autoPauseEnabled: true/false
          ddLimitPct: 0-100
```

**Position Fields (existing):**
- `paused: boolean`
- `pausedAt: timestamp`
- `pausedReason: string` (manual | dd_breach)
- `ddLimitPct: integer` (0 = disabled)
- `autoPauseEnabled: boolean`

### E.5 Sim Session Lifecycle (Existing)

```
    CREATED ────► RUNNING ◄────► PAUSED
                     │
                     ├────► FINISHED (normal completion)
                     ├────► STOPPED (user/admin stopped)
                     └────► FAILED (error)
```

**Existing Statuses (SimSessionStatus):**
| Status | Description |
|--------|-------------|
| created | Session created, not started |
| running | Actively processing candles |
| paused | Temporarily paused |
| stopped | Manually stopped |
| finished | Completed successfully |
| failed | Error during execution |

---

## F) Admin Inbox / Queues

### Queue Types

| Type | Source | Priority | Description |
|------|--------|----------|-------------|
| WITHDRAWAL_PENDING | operations (WITHDRAW_USDT, status=pending) | high | Withdrawals awaiting approval |
| KYC_REVIEW | kyc_applicants (status=IN_REVIEW) | high | KYC submissions to review |
| KYC_ON_HOLD | kyc_applicants (status=ON_HOLD) | medium | KYC cases on hold |
| SIM_FAILED | sim_sessions (status=failed) | low | Failed simulation sessions |
| SWEEP_FAILED | audit_logs (event contains SWEEP + error) | medium | Failed auto-sweep attempts |
| INCIDENT_DRAFT | incidents (status=draft) | medium | Unpublished incidents |
| BALANCE_ASSERTION | audit_logs (INVARIANT_VIOLATION) | critical | Negative balance attempts |

### Queue Item Schema

```typescript
interface AdminQueueItem {
  id: string;
  type: QueueItemType;
  priority: "critical" | "high" | "medium" | "low";
  status: "pending" | "in_progress" | "resolved" | "dismissed";
  
  // Context
  userId?: string;
  resourceType: string;     // operation, kyc_applicant, sim_session, etc.
  resourceId: string;
  
  // Assignment
  assignedTo?: string;      // admin user id
  assignedAt?: timestamp;
  
  // Actions
  nextAction: string;       // "Review withdrawal", "Approve KYC", etc.
  actionUrl: string;        // Deep link to admin page
  
  // Metadata
  createdAt: timestamp;
  updatedAt: timestamp;
  metadata: jsonb;          // Type-specific data
}
```

### Queue Views

1. **My Queue** — Items assigned to current admin
2. **Unassigned** — Items without owner
3. **All Open** — All pending items across team
4. **By Type** — Filtered by queue type

---

## G) Data Boundaries & Invariants

### G.1 Operations Ledger (Canon)

**INVARIANT: Operations table is the single source of truth for money**

- All balance changes MUST create an Operation record
- Admin corrections create new operations with type=`CORRECTION` (NEW)
- Never UPDATE/DELETE existing operation records
- Idempotency keys prevent duplicate operations

**Correction Operation Schema:**
```typescript
{
  type: "CORRECTION",
  status: "completed",
  amount: string,           // can be negative
  reason: string,           // required explanation
  metadata: {
    correctionType: "balance_fix" | "fee_refund" | "chargeback" | "other",
    originalOperationId?: string,
    approvedBy: string,     // admin who approved
    secondApprover?: string // 4-eyes
  }
}
```

### G.2 Idempotency Extension

**Existing:** User-facing money endpoints (deposit, withdraw, invest, vault/transfer)

**Admin Extension:**
- All mutation endpoints in `/api/admin/*` require `X-Idempotency-Key` header
- Admin idempotency keys stored with `adminUserId` for attribution
- Audit log includes idempotency key for traceability

### G.3 Simulation Boundary

**INVARIANT: sim_sessions/sim_events never affect real balances**

- Simulation runs use separate tables: `sim_sessions`, `sim_events`
- No foreign keys to `balances`, `operations`, or `vaults`
- Simulation P&L is derived/analytics data, not ledger data
- Admin can view/control sessions but cannot "materialize" sim results to real balances

### G.4 Audit Requirements

Every admin mutation MUST create audit_log with:
- `userId`: affected user (if applicable)
- `event`: action type (e.g., `ADMIN_WITHDRAWAL_APPROVED`)
- `resourceType`: target entity type
- `resourceId`: target entity id
- `details`: before/after state, reason, metadata
- `ip`, `userAgent`: admin request context
- `adminUserId`: (NEW field) admin who performed action

---

## H) Iteration Plan Preview (8 Slices)

### Slice 1: Foundation & RBAC
Establish admin auth, roles, permissions tables, and middleware. Create admin user bootstrap flow.

### Slice 2: Users & Read-Only Views
User list, search, detail pages. Read-only views of balances, positions, operations per user.

### Slice 3: KYC Queue & Review
KYC backlog queue, review interface, status transitions with audit trail.

### Slice 4: Withdrawals & Approvals
Withdrawal approval queue, approve/decline flow, 4-eyes for large amounts.

### Slice 5: Corrections & Ledger Tools
Correction operation creation with dual approval, ledger reconciliation views.

### Slice 6: Strategies & Sessions
Strategy pause/resume controls, risk limit management, sim_session monitoring.

### Slice 7: Incidents & Status Page
Incident CRUD, status banner publishing, scheduled incidents.

### Slice 8: Exports, Audit & Polish
Export generation (CSV, PDF), audit log viewer, admin inbox/queue system, dashboard metrics.

---

## Appendix: New Tables Required

| Table | Purpose |
|-------|---------|
| `admin_users` | Admin accounts with role assignments |
| `admin_roles` | Role definitions |
| `admin_permissions` | Permission definitions |
| `admin_role_permissions` | Role → permission mapping |
| `admin_audit_logs` | Admin-specific audit (extends audit_logs) |
| `incidents` | Status page incidents |
| `admin_queue_items` | Admin inbox/queue items |
| `admin_idempotency_keys` | Admin action deduplication |

---

*End of Spec v1*
