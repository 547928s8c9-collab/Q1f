# ZEON Fintech Platform - Architecture Documentation

## Overview

ZEON is a full-stack fintech platform for investment management and capital operations. The platform is built as a monolithic application with clear separation between client, server, and shared code.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (React)                        │
│  - React 18 + TypeScript                                     │
│  - Wouter for routing                                        │
│  - TanStack Query for data fetching                         │
│  - Radix UI components                                       │
│  - Tailwind CSS                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/HTTPS
┌──────────────────────▼──────────────────────────────────────┐
│                    Express Server                            │
│  - REST API                                                  │
│  - Authentication (Replit OIDC)                              │
│  - Rate limiting                                             │
│  - Error handling                                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              Business Logic Layer                            │
│  - Routes (modular by domain)                                │
│  - Services (portfolio, market data, strategies)             │
│  - Domain logic (state machines)                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              Data Access Layer                                │
│  - Storage (Drizzle ORM)                                     │
│  - Transactions                                              │
│  - Idempotency                                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              PostgreSQL Database                             │
│  - User data                                                 │
│  - Financial operations                                      │
│  - Audit logs                                                │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Money Operation Flow

```
User Request
    │
    ├─► Idempotency Check
    │       │
    │       ├─► Duplicate? → Return cached response
    │       └─► New? → Acquire lock
    │
    ├─► Validation (Zod schemas)
    │       │
    │       └─► Invalid? → 400 Error
    │
    ├─► Transaction Start
    │       │
    │       ├─► Balance Check
    │       │       │
    │       │       └─► Insufficient? → 400 Error
    │       │
    │       ├─► Update Balances
    │       ├─► Create Operation Record
    │       ├─► Create Audit Log
    │       └─► Complete Idempotency
    │
    └─► Response (200 OK)
```

### Investment Flow

```
User Invests
    │
    ├─► Validate amount & strategy
    ├─► Check balance
    ├─► Transaction:
    │       ├─► Deduct from wallet
    │       ├─► Create position
    │       ├─► Create operation
    │       └─► Audit log
    │
    ├─► Daily Payout Job:
    │       ├─► Calculate returns
    │       ├─► Credit to wallet
    │       ├─► Auto-sweep to vaults (if enabled)
    │       └─► Create notifications
    │
    └─► User can redeem (weekly window)
```

## Component Structure

### Server Structure

```
server/
├── index.ts              # Express app setup
├── routes.ts             # Main route registration
├── routes/               # Modular route handlers
│   ├── core.ts           # Health, bootstrap
│   ├── operations.ts     # Operations CRUD
│   ├── invest.ts         # Investment operations
│   ├── security.ts       # 2FA, KYC
│   └── ...
├── middleware/           # Express middleware
│   ├── errorHandler.ts   # Error handling
│   ├── requireTwoFactor.ts
│   └── ...
├── lib/                  # Utilities
│   ├── logger.ts         # Structured logging
│   ├── rateLimiter.ts    # Rate limiting
│   └── metrics.ts         # Metrics collection
├── storage.ts            # Data access layer
├── db.ts                 # Database connection
└── app/                  # Business logic
    ├── portfolioService.ts
    ├── marketDataService.ts
    └── ...
```

### Client Structure

```
client/src/
├── App.tsx               # Root component
├── pages/                # Page components
│   ├── home.tsx
│   ├── invest/
│   ├── wallet/
│   └── ...
├── components/           # Reusable components
│   ├── ui/               # Base UI components
│   ├── charts/           # Chart components
│   └── ...
├── hooks/                # Custom React hooks
├── lib/                  # Utilities
│   ├── queryClient.ts    # React Query setup
│   └── ...
└── contexts/             # React contexts
```

## Key Design Patterns

### 1. Idempotency Pattern

All money operations use idempotency keys to prevent duplicate transactions:

```typescript
// Client generates unique key
const idempotencyKey = `dep_${uuid}_${timestamp}`;

// Server checks for existing operation
const lock = await acquireIdempotencyLock(userId, key, endpoint);
if (lock.isDuplicate) {
  return cachedResponse;
}

// Process operation
const operation = await processOperation(...);

// Complete idempotency
await completeIdempotency(lock.keyId, operation.id, 200, response);
```

### 2. Transaction Pattern

Critical operations use database transactions:

```typescript
const operation = await withTransaction(async (tx) => {
  // Re-fetch balance within transaction
  const balance = await tx.select().from(balances).where(...);
  
  // Validate
  assertNonNegative(newBalance, "USDT balance");
  
  // Atomic updates
  await tx.update(balances).set({ available: newBalance });
  await tx.insert(operations).values({...});
  await tx.insert(auditLogs).values({...});
  
  return operation;
});
```

### 3. State Machine Pattern

KYC and withdrawal statuses use state machines:

```
KYC: NOT_STARTED → IN_REVIEW → APPROVED/REJECTED
Withdrawal: PENDING → APPROVED → PROCESSING → COMPLETED
```

## Security Architecture

### Authentication Flow

```
User Login
    │
    ├─► Replit OIDC
    │       │
    │       └─► Session created
    │
    ├─► Session middleware
    │       │
    │       └─► Valid? → Continue
    │
    └─► Protected routes
```

### 2FA Flow

```
Sensitive Operation
    │
    ├─► Check 2FA enabled?
    │       │
    │       └─► No? → Continue
    │
    ├─► Rate limit check
    │       │
    │       └─► Exceeded? → 429 Error
    │
    ├─► Verify code (OTP)
    │       │
    │       ├─► Invalid? → 403 Error
    │       └─► Valid? → Continue
    │
    └─► Process operation
```

## Database Schema

### Core Tables

- `users` - User accounts
- `balances` - Wallet balances (available, locked)
- `vaults` - Vault balances (principal, profit, tax_reserve)
- `operations` - All financial operations (immutable ledger)
- `positions` - Investment positions
- `audit_logs` - Audit trail
- `idempotency_keys` - Idempotency tracking

### Relationships

```
users
  ├─► balances (1:N)
  ├─► vaults (1:N)
  ├─► operations (1:N)
  ├─► positions (1:N)
  └─► audit_logs (1:N)

operations
  └─► idempotency_keys (1:1)
```

## Monitoring & Observability

### Metrics Collected

- Request count by endpoint and status
- Response time (avg, p95, p99)
- Error rate
- Business metrics (deposits, withdrawals, investments)

### Logging

- Structured logging with levels (DEBUG, INFO, WARN, ERROR)
- Request IDs for traceability
- Contextual metadata
- Stack traces in development only

### Health Checks

- `/api/health` - Database connectivity
- `/api/status` - System component status
- `/api/metrics/alerts` - Health alerts

## Deployment Architecture

### Development

- Single process (Express + Vite dev server)
- Hot reload enabled
- Debug logging enabled

### Production

- Express serves static files
- Environment-based configuration
- Error details hidden from clients
- Metrics endpoint protected

## Future Improvements

1. **Microservices**: Split into separate services (auth, payments, trading)
2. **Caching**: Redis for rate limiting and session storage
3. **Message Queue**: For async operations (notifications, webhooks)
4. **Event Sourcing**: For audit trail and replay capability
5. **GraphQL**: Alternative API layer for complex queries
