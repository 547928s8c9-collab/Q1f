# ZEON API Idempotency

## Overview

All money-related endpoints in ZEON support **idempotency** to prevent duplicate transactions due to network retries, client errors, or other edge cases.

## Protected Endpoints

The following endpoints support idempotency:

| Endpoint | Description |
|----------|-------------|
| `POST /api/deposit/usdt/simulate` | USDT deposit simulation |
| `POST /api/deposit/card/simulate` | Card deposit simulation |
| `POST /api/invest` | Investment in a strategy |
| `POST /api/withdraw/usdt` | USDT withdrawal |
| `POST /api/vault/transfer` | Vault-to-vault or wallet-to-vault transfers |

## Usage

### Request Header

Include an `Idempotency-Key` header with a unique identifier:

```http
POST /api/deposit/usdt/simulate
Content-Type: application/json
Idempotency-Key: dep_abc123_1705123456789

{"amount": "100000000"}
```

### Key Format

Recommended format: `{prefix}_{uuid}_{timestamp}`

Examples:
- `dep_550e8400-e29b-41d4-a716-446655440000_1705123456789`
- `inv_user123_strategy456_1705123456789`
- `wdr_randomuuid_1705123456789`

### Behavior

1. **First Request**: Acquires a lock (inserts pending row), executes operation, stores response
2. **Duplicate Request (completed)**: Returns the cached response from the first request immediately
3. **Duplicate Request (in-progress)**: Returns 409 Conflict - retry later
4. **No Header**: Request executes normally without idempotency protection

### Response

Successful duplicate requests return:
- Same HTTP status code as original (200)
- Same response body as original
- No additional side effects (no balance changes, no new operations)

In-progress duplicate requests return:
- HTTP 409 Conflict
- `{ "error": "Request in progress", "code": "IDEMPOTENCY_CONFLICT" }`

## Implementation Details

### Atomic Approach

The implementation uses an **atomic lock acquisition** pattern:

1. **Acquire Lock**: Insert a pending row (responseStatus = null) BEFORE executing side effects
2. **Execute Operation**: Perform balance updates, create operations, etc.
3. **Complete Lock**: Update the row with the response status and body

This ensures that:
- Only ONE concurrent request can acquire the lock
- If two identical requests arrive simultaneously, only one will execute
- The second request gets a 409 Conflict until the first completes

### Database Schema

```sql
CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  idempotency_key VARCHAR(64) NOT NULL,
  endpoint TEXT NOT NULL,
  operation_id UUID,
  response_status INTEGER,  -- NULL = in-progress, non-null = completed
  response_body JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, idempotency_key, endpoint)
);
```

### Race Condition Handling

- Unique constraint on `(user_id, idempotency_key, endpoint)` prevents race conditions
- PostgreSQL's unique constraint violation (error code 23505) is caught gracefully
- If constraint violation occurs, the existing row is checked for completion status

### Key Scoping

Keys are scoped by:
- **User ID**: Each user has their own key namespace
- **Endpoint**: Same key can be used for different endpoints safely

## Best Practices

1. **Always use idempotency keys** for money operations
2. **Generate unique keys** on the client side before sending
3. **Include context** in the key (user, operation type, timestamp)
4. **Retry with same key** if the request times out or fails
5. **Don't reuse keys** for different operations on the same endpoint

## Example Client Code

```typescript
async function deposit(amount: string, retries = 3) {
  const idempotencyKey = `dep_${crypto.randomUUID()}_${Date.now()}`;
  
  for (let i = 0; i < retries; i++) {
    const response = await fetch('/api/deposit/usdt/simulate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ amount }),
    });
    
    if (response.status === 409) {
      // Request in progress, wait and retry
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }
    
    return response.json();
  }
  
  throw new Error('Request timed out');
}
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Missing header | Request executes normally (no idempotency) |
| Duplicate key, same user, same endpoint | Returns cached response |
| Duplicate key, same user, different endpoint | Executes normally (keys are endpoint-scoped) |
| Same key, different user | Executes normally (keys are user-scoped) |
| Concurrent duplicate (in-progress) | Returns 409 Conflict |
| Server error on first request | Error NOT cached, pending row left (retry with same key re-executes) |
