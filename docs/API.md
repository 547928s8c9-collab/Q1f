# ZEON Fintech API Documentation

## Base URL

All API endpoints are prefixed with `/api`.

## Authentication

Most endpoints require authentication via Replit OIDC. Include the session cookie in requests.

## Idempotency

All money-related endpoints support idempotency keys via the `Idempotency-Key` header to prevent duplicate transactions.

## Endpoints

### Core

#### `GET /api/health`
Health check endpoint (public).

**Response:**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-01-16T10:00:00.000Z"
}
```

#### `GET /api/bootstrap`
Main bootstrap endpoint that returns all user data (protected).

**Response:**
```json
{
  "user": { "id": "...", "email": "...", "name": "..." },
  "balances": [...],
  "vaults": [...],
  "invested": { "current": "...", "principal": "..." },
  "portfolio": { "summary": {...}, "series": [...] },
  "security": {...},
  "consent": {...},
  "onboarding": {...},
  "gates": {...},
  "quotes": {...},
  "whitelistAddresses": [...]
}
```

### Status

#### `GET /api/status`
System status endpoint (public).

**Response:**
```json
{
  "overall": "operational",
  "message": null,
  "components": {
    "deposits": { "status": "operational" },
    "withdrawals": { "status": "operational" },
    "strategies": { "status": "operational" },
    "api": { "status": "operational" }
  },
  "timestamp": "2026-01-16T10:00:00.000Z"
}
```

### Deposits

#### `POST /api/deposit/usdt/simulate`
Simulate USDT deposit (dev only, protected).

**Headers:**
- `Idempotency-Key`: Unique key for idempotency

**Request:**
```json
{
  "amount": "100000000"
}
```

**Response:**
```json
{
  "operation": {
    "id": "...",
    "type": "deposit",
    "status": "completed",
    "amount": "100000000"
  }
}
```

#### `POST /api/deposit/card/simulate`
Simulate card deposit (dev only, protected).

**Headers:**
- `Idempotency-Key`: Unique key for idempotency

**Request:**
```json
{
  "amount": "100000000",
  "sourceAmount": "92000000",
  "sourceAsset": "RUB"
}
```

### Withdrawals

#### `POST /api/withdraw/usdt`
Withdraw USDT to external address (protected, requires 2FA).

**Headers:**
- `Idempotency-Key`: Unique key for idempotency
- `X-2FA-Code`: 6-digit 2FA code

**Request:**
```json
{
  "amount": "50000000",
  "address": "0x1234567890123456789012345678901234567890"
}
```

**Response:**
```json
{
  "operation": {
    "id": "...",
    "type": "withdraw",
    "status": "pending",
    "amount": "50000000",
    "fee": "1000000"
  }
}
```

### Investments

#### `POST /api/invest`
Invest in a strategy (protected).

**Headers:**
- `Idempotency-Key`: Unique key for idempotency

**Request:**
```json
{
  "amount": "100000000",
  "strategyId": "..."
}
```

**Response:**
```json
{
  "success": true,
  "operation": {
    "id": "..."
  }
}
```

### Vaults

#### `POST /api/vault/transfer`
Transfer between vaults or wallet (protected).

**Headers:**
- `Idempotency-Key`: Unique key for idempotency

**Request:**
```json
{
  "fromVault": "wallet",
  "toVault": "principal",
  "amount": "20000000"
}
```

**Response:**
```json
{
  "operation": {
    "id": "...",
    "type": "vault_transfer",
    "status": "completed"
  }
}
```

#### `POST /api/vault/goal`
Update vault goal settings (protected).

**Request:**
```json
{
  "type": "principal",
  "goalName": "Emergency Fund",
  "goalAmount": "1000000000",
  "autoSweepPct": 25,
  "autoSweepEnabled": true
}
```

### Strategies

#### `GET /api/strategies`
Get all available strategies (public).

**Response:**
```json
[
  {
    "id": "...",
    "name": "...",
    "description": "...",
    "riskTier": "LOW",
    "minInvestment": "100000000",
    "isActive": true
  }
]
```

#### `GET /api/strategies/:id`
Get strategy details (public).

#### `GET /api/strategies/:id/series`
Get strategy performance series (public).

### Operations

#### `GET /api/operations`
Get user operations (protected).

**Query Parameters:**
- `filter`: Filter by type (optional)
- `q`: Search query (optional)
- `cursor`: Pagination cursor (optional)
- `limit`: Results limit (default: 50)

**Response:**
```json
{
  "operations": [...],
  "nextCursor": "..."
}
```

### Statements

#### `GET /api/statements/summary`
Get monthly statement summary (protected).

**Query Parameters:**
- `year`: Year (YYYY)
- `month`: Month (MM)

**Response:**
```json
{
  "year": 2026,
  "month": 1,
  "totalIn": "1000000000",
  "totalOut": "500000000",
  "fees": "10000000",
  "netChange": "490000000"
}
```

#### `GET /api/statements/monthly`
Download monthly statement PDF (protected).

**Query Parameters:**
- `year`: Year (YYYY)
- `month`: Month (MM)

### Security

#### `POST /api/security/2fa/toggle`
Enable or disable 2FA (protected).

**Request:**
```json
{
  "enabled": true
}
```

#### `GET /api/security/2fa/qr`
Get 2FA QR code for setup (protected).

### KYC

#### `GET /api/kyc/status`
Get KYC status (protected).

**Response:**
```json
{
  "status": "APPROVED",
  "allowedTransitions": []
}
```

#### `POST /api/kyc/start`
Start KYC process (protected).

### Consent

#### `GET /api/consent/status`
Get consent status (protected).

#### `POST /api/consent/accept`
Accept terms and conditions (protected, idempotent).

### Notifications

#### `GET /api/notifications`
Get user notifications (protected).

**Query Parameters:**
- `filter`: "all" | "unread" (default: "all")
- `limit`: Results limit (default: 50)

#### `POST /api/notifications/:id/read`
Mark notification as read (protected).

#### `POST /api/notifications/read-all`
Mark all notifications as read (protected).

### Analytics

#### `GET /api/analytics/portfolio`
Get portfolio analytics (protected).

#### `GET /api/analytics/performance`
Get performance analytics (protected).

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

- `INSUFFICIENT_BALANCE`: Not enough balance for operation
- `TWO_FACTOR_REQUIRED`: 2FA code required
- `TWO_FACTOR_INVALID`: Invalid 2FA code
- `TWO_FACTOR_RATE_LIMIT_EXCEEDED`: Too many 2FA attempts
- `KYC_REQUIRED`: KYC verification required
- `VALIDATION_ERROR`: Input validation failed
- `IDEMPOTENCY_CONFLICT`: Request in progress
- `NOT_FOUND`: Resource not found
- `UNAUTHORIZED`: Authentication required
- `FORBIDDEN`: Insufficient permissions

## Rate Limiting

- Authentication endpoints: 20 requests/minute
- General API: 120 requests/minute
- Market data: 60 requests/minute
- Metrics: 10 requests/minute
- 2FA verification: 5 attempts per 15 minutes

## Status Codes

- `200`: Success
- `400`: Bad Request (validation error)
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict (idempotency)
- `429`: Too Many Requests
- `500`: Internal Server Error
- `503`: Service Unavailable
