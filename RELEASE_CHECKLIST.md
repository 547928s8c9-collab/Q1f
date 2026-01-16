# ZEON Release Checklist

## E2E Test Evidence

This document tracks E2E testing evidence for critical money flows.

---

## Withdraw Flow

### Preconditions
- User completed onboarding (verify, consent, KYC approved)
- 2FA enabled (`POST /api/security/2fa/toggle {"enabled": true}`)
- Sufficient USDT balance (deposit via `POST /api/deposit/usdt/simulate`)
- Whitelist configured (if whitelistEnabled=true)

### Happy Path
| Step | Action | Expected | Verified |
|------|--------|----------|----------|
| 1 | Navigate to /withdraw | Withdraw page loads with amount/address inputs | ✅ |
| 2 | Enter amount (e.g., 50 USDT) | Input accepts numeric value | ✅ |
| 3 | Enter valid address (42-char hex) | Input accepts address | ✅ |
| 4 | Submit withdraw | Loading state, then success toast | ✅ |
| 5 | Check /api/bootstrap | USDT available decreased by withdraw amount + fee | ✅ |
| 6 | View receipt in /activity | Operation shows as PENDING/COMPLETED | ✅ |

### API Evidence
```
POST /api/withdraw/usdt
Body: {"amount": "50000000", "address": "0x1234567890123456789012345678901234567890"}
Response: 200 OK with operation object
```

### Negative Cases
| Case | Input | Expected Response | Verified |
|------|-------|-------------------|----------|
| Insufficient balance | amount > balance | 400 `{"error": "Insufficient balance"}` | ✅ |
| 2FA not enabled | 2FA disabled | 403 `{"code": "TWO_FACTOR_REQUIRED"}` | ✅ |
| KYC not approved | KYC != APPROVED | 403 `{"code": "KYC_REQUIRED"}` | ✅ |
| Invalid address | address < 30 chars | 400 validation error | ✅ |

### Database Evidence
- operations table: New row with type="withdraw", status="pending"
- balances table: available decreased, locked may temporarily increase
- audit_logs: Event logged for security/compliance

---

## Vault Transfer Flow

### Preconditions
- User authenticated with vaults initialized (ensureUserData creates 3 vaults)
- Source vault/wallet has sufficient balance

### Vault Types
- `principal` - Principal vault
- `profit` - Profit vault  
- `tax_reserve` - Tax Reserve vault
- `wallet` - Main wallet balance (special case)

### Happy Path
| Step | Action | Expected | Verified |
|------|--------|----------|----------|
| 1 | Navigate to /wallet/vaults | Three vault cards displayed | ✅ |
| 2 | Open transfer dialog | From/To dropdowns and amount input | ✅ |
| 3 | Select wallet → principal | Valid selection | ✅ |
| 4 | Enter amount (e.g., 20 USDT) | Input accepts value | ✅ |
| 5 | Submit transfer | Success toast | ✅ |
| 6 | Check /api/bootstrap | Principal vault balance increased, wallet decreased | ✅ |

### API Evidence
```
POST /api/vault/transfer
Body: {"fromVault": "wallet", "toVault": "principal", "amount": "20000000"}
Response: 200 OK with operation object
```

### Transfer Combinations Tested
| From | To | Result |
|------|----|--------|
| wallet | principal | ✅ Works |
| principal | profit | ✅ Works |
| profit | tax_reserve | ✅ Works |
| vault | wallet | ✅ Works |

### Negative Cases
| Case | Input | Expected Response | Verified |
|------|-------|-------------------|----------|
| Insufficient balance | amount > vault balance | 400 `{"error": "Insufficient vault balance"}` | ✅ |
| Same vault | fromVault = toVault | 400 `{"error": "Source and destination must be different"}` | ✅ |
| Invalid vault name | fromVault = "invalid" | 400 validation error | ✅ |

### Database Evidence
- operations table: New row with type="vault_transfer"
- vaults table: Source balance decreased, destination balance increased
- balances table: Updated if wallet involved

---

## Known Issues

| Issue | Severity | Description | Workaround |
|-------|----------|-------------|------------|
| UI stale vault data | Minor (P2) | After API vault transfer, UI may show stale balance until refresh | Refresh page or invalidate query cache |

---

## Test Date
Last verified: 2026-01-16

## Test Method
- E2E tests via Playwright
- API tests via curl
- Database verification via SQL queries
