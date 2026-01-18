# ZEON Platform: Current State Map

> Generated: January 2026  
> Purpose: Repository snapshot for Admin Console architecture planning

---

## 1. Repository Structure

```
./
├── server/                          # Backend (Express + TypeScript ESM)
│   ├── index.ts                     # Server entry point
│   ├── routes.ts                    # All API route handlers (~3800 lines)
│   ├── storage.ts                   # DatabaseStorage class (IStorage interface)
│   ├── db.ts                        # Drizzle ORM + pg pool + withTransaction helper
│   ├── seed.ts                      # Demo data seeding
│   ├── vite.ts                      # Vite dev server integration
│   ├── static.ts                    # Static file serving
│   ├── replit_integrations/auth/    # Replit OIDC auth (routes, storage, replitAuth)
│   ├── marketData/                  # Market data loading (Binance spot)
│   └── data/                        # Binance API integration
│
├── shared/                          # Shared types (FE + BE)
│   ├── schema.ts                    # Drizzle schema + Zod validators + DTOs
│   └── models/auth.ts               # Auth tables (users, sessions)
│
├── client/src/                      # Frontend (React 18 + TypeScript)
│   ├── App.tsx                      # Router + auth gate
│   ├── main.tsx                     # Entry point
│   ├── hooks/                       # Custom hooks (useAuth, useTheme, useToast, etc.)
│   ├── lib/                         # Query client, utils
│   ├── contexts/                    # React contexts
│   ├── components/
│   │   ├── ui/                      # shadcn/ui components (40+ files)
│   │   ├── charts/                  # Recharts wrappers
│   │   ├── operations/              # Operation list, receipt
│   │   ├── strategy/                # Strategy cards, comparison
│   │   ├── vault/                   # Vault cards, goals
│   │   ├── security/                # Security settings UI
│   │   ├── wallet/                  # Balance display
│   │   └── onboarding/              # Gate guard, steps
│   └── pages/
│       ├── home.tsx, landing.tsx, analytics.tsx
│       ├── invest/                  # Strategy list, detail, confirm
│       ├── wallet/                  # Wallet, vaults
│       ├── deposit/, withdraw.tsx   # Deposit/withdraw flows
│       ├── activity/                # Operations list, receipt
│       ├── settings/                # General, security settings
│       ├── onboarding/              # Welcome, verify, consent, kyc, smart-start
│       ├── inbox.tsx, statements.tsx, status.tsx
│       └── not-found.tsx
│
├── ROADMAP.md                       # Implementation history + decisions
└── replit.md                        # Project architecture docs
```

---

## 2. Database Schema (Drizzle ORM)

### Core Tables (22 total)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | Auth users (Replit OIDC) | id, email, firstName, lastName, profileImageUrl |
| `sessions` | Express sessions | sid, sess (jsonb), expire |
| `balances` | Wallet balances per asset | userId, asset (RUB/USDT), available, locked (string minor units) |
| `vaults` | Savings vaults with goals | userId, type (principal/profit/taxes), balance, goalName, goalAmount, autoSweepPct, autoSweepEnabled |
| `operations` | **CANONICAL MONEY LEDGER** | userId, type, status, asset, amount, fee, txHash, strategyId, fromVault, toVault, metadata, reason |
| `positions` | User investments in strategies | userId, strategyId, principalMinor, investedCurrentMinor, accruedProfitPayableMinor, paused, ddLimitPct |
| `strategies` | Investment strategy catalog | id, name, riskTier (LOW/CORE/HIGH), feesJson, termsJson, minInvestment |
| `strategy_performance` | Daily equity snapshots | strategyId, day, date, equityMinor, benchmarkBtcMinor |
| `strategy_series` | Normalized series data | strategyId, date, value |
| `portfolio_series` | User portfolio history | userId, date, value |
| `quotes` | Market quotes | pair (BTC/USDT, etc.), date, price, change24h |
| `security_settings` | User security config | userId, contactVerified, consentAccepted, kycStatus, twoFactorEnabled, whitelistEnabled |
| `whitelist_addresses` | Withdrawal whitelist | userId, address, label, network, status (PENDING_ACTIVATION/ACTIVE/DISABLED) |
| `payout_instructions` | Per-strategy payout config | userId, strategyId, frequency (DAILY/MONTHLY), addressId, minPayoutMinor |
| `redemption_requests` | Principal withdrawal requests | userId, strategyId, amountMinor, status (PENDING/EXECUTED/CANCELLED), executeAt |
| `consents` | Versioned consent records | userId, version, documentType, docHash, acceptedAt, ip, userAgent |
| `audit_logs` | Compliance audit trail | userId, event, resourceType, resourceId, details (jsonb), ip, userAgent |
| `kyc_applicants` | KYC state machine | userId, status (NOT_STARTED/IN_REVIEW/APPROVED/NEEDS_ACTION/REJECTED/ON_HOLD), providerRef, riskLevel |
| `notifications` | Inbox notifications | userId, type (transaction/kyc/security/system), title, message, isRead, ctaLabel, ctaUrl |
| `idempotency_keys` | Request deduplication | userId, idempotencyKey, endpoint, operationId, responseStatus, responseBody |
| `market_candles` | OHLCV candle data | exchange, symbol, timeframe, ts, open, high, low, close, volume |

### Key Indexes
- `idempotency_user_key_endpoint_idx` - unique (userId, idempotencyKey, endpoint)
- `market_candles_unique_idx` - unique (exchange, symbol, timeframe, ts)

---

## 3. API Endpoints

### Auth & Bootstrap
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /api/health | - | Health check (DB ping) |
| GET | /api/bootstrap | ✓ | Full user state (balances, vaults, positions, security, etc.) |
| GET | /api/auth/user | ✓ | Current user info (Replit Auth) |

### Money Operations (Canonical Ledger)
| Method | Path | Auth | Idempotent | Purpose |
|--------|------|------|------------|---------|
| POST | /api/deposit/usdt/simulate | ✓ | ✓ | Simulate USDT deposit |
| POST | /api/deposit/card/simulate | ✓ | ✓ | Simulate card deposit (RUB→USDT) |
| POST | /api/invest | ✓ | ✓ | Invest in strategy |
| POST | /api/withdraw/usdt | ✓ | ✓ | Withdraw USDT |
| POST | /api/vault/transfer | ✓ | ✓ | Transfer between wallet/vaults |
| POST | /api/payout/daily | ✓ | - | Trigger daily payout (with auto-sweep) |

### Operations/Activity
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /api/operations | ✓ | List operations (cursor pagination) |
| GET | /api/operations/:id | ✓ | Single operation detail |
| GET | /api/operations/export | ✓ | CSV export |
| GET | /api/statements/summary | ✓ | Monthly summary stats |
| GET | /api/statements/monthly | ✓ | PDF statement generation |

### Strategies & Positions
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /api/strategies | - | List all strategies |
| GET | /api/strategies/:id | - | Strategy detail |
| GET | /api/strategies/:id/performance | - | Performance data |
| GET | /api/positions/:strategyId/risk-controls | ✓ | Get risk settings |
| POST | /api/positions/:strategyId/risk-controls | ✓ | Update risk settings |
| POST | /api/positions/:strategyId/pause | ✓ | Pause/resume position |
| GET | /api/payout-instructions | ✓ | Get payout config |
| POST | /api/payout-instructions | ✓ | Update payout config |
| GET | /api/redemptions | ✓ | List redemption requests |
| POST | /api/redemptions | ✓ | Create redemption request |

### Security & Whitelist
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/security/2fa/toggle | ✓ | Toggle 2FA |
| POST | /api/security/whitelist/toggle | ✓ | Toggle whitelist mode |
| GET | /api/security/whitelist | ✓ | List addresses |
| POST | /api/security/whitelist/add | ✓ | Add address |
| POST | /api/security/whitelist/remove | ✓ | Remove address |
| POST | /api/security/address-delay | ✓ | Set activation delay |
| POST | /api/security/anti-phishing | ✓ | Set anti-phishing code |
| POST | /api/security/auto-sweep | ✓ | Toggle vault auto-sweep |
| POST | /api/vault/goal | ✓ | Update vault goal settings |

### KYC & Onboarding
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /api/kyc/status | ✓ | Get KYC status |
| POST | /api/kyc/start | ✓ | Start KYC (demo) |
| POST | /api/onboarding/send-code | ✓ | Send verification code |
| POST | /api/onboarding/verify-code | ✓ | Verify code |
| POST | /api/onboarding/accept-consent | ✓ | Accept consent |
| POST | /api/onboarding/complete-kyc | ✓ | Complete KYC (demo) |
| GET | /api/consent/status | ✓ | Consent status |
| POST | /api/consent/accept | ✓ | Accept consent |
| GET | /api/sumsub/access-token | ✓ | Sumsub SDK token (demo) |
| POST | /api/sumsub/webhook | - | Sumsub callback |

### Notifications
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /api/notifications | ✓ | List notifications |
| GET | /api/notifications/count | ✓ | Unread count |
| POST | /api/notifications/:id/read | ✓ | Mark as read |
| POST | /api/notifications/read-all | ✓ | Mark all read |

### Jobs (Dev/Admin)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/jobs/accrue-daily | - | Accrue daily returns |
| POST | /api/jobs/payout-run | - | Execute profit payouts |
| POST | /api/jobs/redemption-weekly-run | - | Execute redemptions |
| GET | /api/status | - | System status page data |

---

## 4. Domain Flows

### 4.1 Money Flow (Operations Ledger)

**INVARIANT: All money mutations create Operation records**

```
┌─────────────────────────────────────────────────────────────────┐
│                    OPERATIONS LEDGER (CANON)                     │
├─────────────────────────────────────────────────────────────────┤
│ Type               │ Status Flow                                 │
├────────────────────┼────────────────────────────────────────────┤
│ DEPOSIT_USDT       │ pending → processing → completed/failed     │
│ DEPOSIT_CARD       │ pending → processing → completed/failed     │
│ WITHDRAW_USDT      │ pending → processing → completed/failed     │
│ INVEST             │ pending → completed/failed                  │
│ DAILY_PAYOUT       │ completed                                   │
│ PROFIT_ACCRUAL     │ completed                                   │
│ PROFIT_PAYOUT      │ completed                                   │
│ PRINCIPAL_REDEEM   │ completed                                   │
│ VAULT_TRANSFER     │ completed (reason: manual/AUTO_SWEEP)       │
│ FX                 │ pending → completed/failed                  │
└────────────────────┴────────────────────────────────────────────┘
```

**Atomic Transaction Pattern (NEXT-04):**
```typescript
await withTransaction(async (tx) => {
  // 1. Re-fetch balance within transaction
  // 2. assertNonNegative(newBalance)
  // 3. Update balance
  // 4. Create operation
  // 5. Create audit log
});
```

### 4.2 Deposit Flow
```
User → POST /api/deposit/usdt/simulate
  ├── Idempotency check
  ├── Atomic transaction:
  │   ├── wallet.available += amount
  │   ├── INSERT operation (DEPOSIT_USDT, completed)
  │   └── INSERT audit_log
  └── CREATE notification
```

### 4.3 Withdrawal Flow
```
User → POST /api/withdraw/usdt
  ├── Idempotency check
  ├── Validate whitelist (if enabled)
  ├── Atomic transaction:
  │   ├── assertNonNegative(wallet - amount - fee)
  │   ├── wallet.available -= (amount + fee)
  │   ├── INSERT operation (WITHDRAW_USDT, completed)
  │   └── INSERT audit_log
  └── CREATE notification
```

### 4.4 Investment Flow
```
User → POST /api/invest
  ├── Idempotency check
  ├── Validate strategy exists, meets minimum
  ├── Atomic transaction:
  │   ├── assertNonNegative(wallet - amount)
  │   ├── wallet.available -= amount
  │   ├── position.principalMinor += amount
  │   ├── position.investedCurrentMinor += amount
  │   ├── INSERT operation (INVEST, completed)
  │   └── INSERT audit_log
  └── CREATE notification
```

### 4.5 Vault Transfer Flow
```
User → POST /api/vault/transfer
  ├── Idempotency check
  ├── Validate source/target vault types
  ├── Atomic transaction:
  │   ├── assertNonNegative(source - amount)
  │   ├── source.balance -= amount
  │   ├── target.balance += amount
  │   ├── INSERT operation (VAULT_TRANSFER, completed)
  │   └── INSERT audit_log
  └── CREATE notification
```

### 4.6 Auto-Sweep Flow (NEXT-05)
```
Daily Payout → For each vault with autoSweepEnabled:
  ├── sweepAmount = profitDelta × autoSweepPct / 100
  ├── Atomic transaction:
  │   ├── assertNonNegative(wallet - sweepAmount)
  │   ├── wallet -= sweepAmount
  │   ├── vault += sweepAmount
  │   ├── INSERT operation (VAULT_TRANSFER, reason=AUTO_SWEEP)
  │   └── INSERT audit_log (VAULT_TRANSFER_AUTO_SWEEP)
  └── CREATE notification
```

### 4.7 KYC State Machine
```
NOT_STARTED → IN_REVIEW → APPROVED (terminal)
                       → NEEDS_ACTION → IN_REVIEW
                       → REJECTED (terminal)
                       → ON_HOLD → IN_REVIEW/REJECTED
```

---

## 5. Status Enums (Centralized)

| Entity | Enum | Values | Location |
|--------|------|--------|----------|
| Operation | OperationStatus | pending, processing, completed, failed, cancelled | shared/schema.ts:659-665 |
| Redemption | RedemptionStatus | PENDING, EXECUTED, CANCELLED | shared/schema.ts:116-120 |
| KYC | KycStatus | NOT_STARTED, IN_REVIEW, APPROVED, NEEDS_ACTION, REJECTED, ON_HOLD | shared/schema.ts:307-314 |
| Address | AddressStatus | PENDING_ACTIVATION, ACTIVE, DISABLED | shared/schema.ts:223-227 |
| Payout | PayoutFrequency | DAILY, MONTHLY | shared/schema.ts:247-250 |

---

## 6. UI Routes (Wouter)

### Protected Routes (require auth + onboarding)
| Path | Component | Purpose |
|------|-----------|---------|
| / | Home | Dashboard |
| /analytics | Analytics | Portfolio analytics |
| /invest | Invest | Strategy list |
| /invest/:id | StrategyDetail | Strategy info |
| /invest/:id/confirm | InvestConfirm | Investment confirmation |
| /wallet | Wallet | Balances overview |
| /wallet/vaults | Vaults | Vault management |
| /deposit/usdt | DepositUSDT | USDT deposit |
| /deposit/card | DepositCard | Card deposit |
| /withdraw | Withdraw | Withdrawal flow |
| /activity | Activity | Operations list |
| /activity/:operationId | Receipt | Operation receipt |
| /settings | Settings | General settings |
| /settings/security | SecuritySettings | Security config |
| /statements | Statements | Monthly statements |
| /status | StatusPage | System status |
| /inbox | Inbox | Notifications |

### Onboarding Routes
| Path | Component | Purpose |
|------|-----------|---------|
| /onboarding | OnboardingWelcome | Welcome screen |
| /onboarding/verify | OnboardingVerify | Phone/email verify |
| /onboarding/consent | OnboardingConsent | Terms acceptance |
| /onboarding/kyc | OnboardingKyc | KYC submission |
| /onboarding/smart-start | SmartStart | Investment quiz |
| /onboarding/smart-start/results | SmartStartResults | Recommendations |
| /onboarding/done | OnboardingDone | Completion |

---

## 7. Invariants & Safeguards

### Implemented ✅

1. **Operations Ledger is Canon** - All money mutations create Operation records
2. **Atomic Transactions** - withTransaction() wrapper for consistency
3. **Invariant Checks** - assertNonNegative() prevents negative balances
4. **Idempotency** - 5 money endpoints protected (deposit/withdraw/invest/transfer)
5. **Audit Logging** - All sensitive operations logged with IP/userAgent
6. **Minor Units** - All money stored as string integers (USDT: 6 decimals, RUB: 2)
7. **Auto-Sweep** - Per-vault percentage of profit auto-transferred
8. **KYC State Machine** - Defined transitions prevent invalid states

### Gaps / Risks ⚠️

1. **No RBAC** - All routes use single isAuthenticated middleware, no admin roles
2. **No Admin API** - No /api/admin/* endpoints exist
3. **Jobs are Unauthenticated** - /api/jobs/* endpoints have no auth (dev only)
4. **No 4-Eyes Approval** - Large operations don't require dual approval
5. **No Step-Up Auth** - Sensitive ops don't require re-auth
7. **No Rate Limiting** - API endpoints lack rate limiting
8. **Manual Corrections** - No correction operation type for ledger fixes

---

## 8. Key File Paths

### Schema & Types
- `shared/schema.ts` - All Drizzle tables, enums, Zod schemas, DTOs
- `shared/models/auth.ts` - Auth tables (users, sessions)

### Backend
- `server/routes.ts` - All API route handlers
- `server/storage.ts` - IStorage interface + DatabaseStorage class
- `server/db.ts` - Drizzle setup, withTransaction helper
- `server/replit_integrations/auth/` - Replit OIDC integration

### Frontend
- `client/src/App.tsx` - Router + auth gate
- `client/src/components/onboarding/gate-guard.tsx` - Onboarding flow guard
- `client/src/pages/` - All page components

### Documentation
- `ROADMAP.md` - Implementation history and decisions
- `replit.md` - Project architecture summary

---

## 9. Summary for Admin Console Planning

**What Exists:**
- Complete multi-user fintech app with wallet/vaults/strategies
- Operations ledger as single source of truth for money
- Atomic transactions with invariant enforcement
- Idempotency on all money endpoints
- Comprehensive audit logging

**What's Missing for Admin:**
- RBAC system (roles, permissions)
- Admin-specific API endpoints (/api/admin/*)
- Admin UI (/admin/*)
- Correction operations for ledger fixes
- 4-eyes approval workflow
- Rate limiting middleware
- Status page admin controls (currently read-only)

**Recommended Admin First Modules:**
1. Users/KYC management (read + status changes)
2. Operations ledger viewer (read-only + corrections)
3. Withdrawal approval queue
4. Strategy/position management
5. System status controls
