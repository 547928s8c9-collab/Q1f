# ZEON Admin Console — Manual Test Checklist

## Prerequisites

- Admin user seeded with SuperAdmin role
- Regular user with completed onboarding (for data)
- Browser DevTools open (Network tab)

---

## 1. RBAC Verification

### 1.1 Authentication (401)

| Test | Expected |
|------|----------|
| `GET /api/admin/me` without Authorization header | 401 `ADMIN_REQUIRED` |
| `GET /api/admin/users` without Authorization header | 401 `ADMIN_REQUIRED` |
| Navigate to `/admin` without login | Redirect to login or 401 page |

### 1.2 Authorization (403)

| Test | Expected |
|------|----------|
| ReadOnly role calls `POST /api/admin/users/:id/roles` | 403 `RBAC_DENIED` |
| Support role calls `GET /api/admin/audit-logs` | 403 `RBAC_DENIED` |
| Response includes `requiredPermission` field | Yes |

### 1.3 Success (200)

| Test | Expected |
|------|----------|
| SuperAdmin calls `GET /api/admin/me` | 200 with roles, permissions |
| Ops role calls `GET /api/admin/operations` | 200 with data |
| Compliance role calls `GET /api/admin/kyc` (when implemented) | 200 with data |

---

## 2. Envelope & RequestId

### 2.1 Success Response Format

```json
{
  "ok": true,
  "data": { ... },
  "meta": { "nextCursor": "..." },
  "requestId": "uuid-v4"
}
```

**Checks:**
- [ ] Every response has `requestId` field
- [ ] `ok: true` on 2xx responses
- [ ] `meta.nextCursor` present when more pages exist
- [ ] `meta.nextCursor` is `null` on last page

### 2.2 Error Response Format

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "User not found"
  },
  "requestId": "uuid-v4"
}
```

**Checks:**
- [ ] `ok: false` on 4xx/5xx responses
- [ ] `error.code` is machine-readable (NOT_FOUND, RBAC_DENIED, VALIDATION_ERROR)
- [ ] `error.message` is human-readable
- [ ] `requestId` present on errors too

---

## 3. Cursor Pagination

### 3.1 /api/admin/users

| Request | Expected |
|---------|----------|
| `GET /api/admin/users?limit=2` | Returns 2 users + `nextCursor` |
| `GET /api/admin/users?limit=2&cursor=<nextCursor>` | Returns next 2 users |
| `GET /api/admin/users?limit=1000` | Capped at 100 (max limit) |
| Last page | `nextCursor: null` |

### 3.2 /api/admin/operations

| Request | Expected |
|---------|----------|
| `GET /api/admin/operations?limit=5` | Returns 5 operations |
| Cursor format | `createdAt_id` (e.g., `2024-01-15T10:00:00.000Z_abc123`) |

---

## 4. UI States

### 4.1 Loading State

- [ ] `/admin/users` shows skeleton/spinner on initial load
- [ ] `/admin/operations` shows skeleton during fetch
- [ ] Buttons disabled during mutations

### 4.2 Error State

- [ ] Network error shows toast "Failed to load"
- [ ] 403 shows "Access Denied" message
- [ ] 404 on detail page shows "Not Found" state

### 4.3 Empty State

- [ ] `/admin/users` with no users shows "No users found"
- [ ] `/admin/operations` with no operations shows "No operations"
- [ ] Empty state has appropriate icon/illustration

---

## 5. Negative Cases

### 5.1 NOT_FOUND (404)

| Test | Expected |
|------|----------|
| `GET /api/admin/users/nonexistent-id` | 404 `NOT_FOUND` |
| `GET /api/admin/operations/nonexistent-id` | 404 `NOT_FOUND` |

### 5.2 VALIDATION_ERROR (400)

| Test | Expected |
|------|----------|
| `POST /api/admin/kyc/:id/decision` with empty body | 400 `VALIDATION_ERROR` |
| `POST /api/admin/corrections` with negative amount | 400 `VALIDATION_ERROR` |
| Invalid cursor format | 400 `VALIDATION_ERROR` |

### 5.3 CONFLICT (409)

| Test | Expected |
|------|----------|
| Duplicate Idempotency-Key (when implemented) | 409 or cached response |

---

## 6. Smoke Test: "Admin in 5 Minutes"

**Scenario:** New admin logs in and performs basic tasks.

| Step | Action | Verify |
|------|--------|--------|
| 1 | Navigate to `/admin` | Dashboard loads, sidebar visible |
| 2 | Check `/api/admin/me` in Network tab | 200, has roles/permissions |
| 3 | Click "Users" in sidebar | Users table loads with data |
| 4 | Use pagination (next page) | New users appear, cursor changes |
| 5 | Click on a user row | User detail opens (drawer/modal) |
| 6 | Click "Operations" in sidebar | Operations table loads |
| 7 | Filter operations by type (if available) | Table updates |
| 8 | Click "Inbox" in sidebar | Inbox items load |
| 9 | Mark an inbox item as read | Item updates |
| 10 | Logout | Redirect to login, `/api/admin/*` returns 401 |

---

## 7. Security Checks

### 7.1 IDOR Prevention

- [ ] `/api/admin/users/:id` cannot access other admin's internal data
- [ ] No user can modify another admin's roles without permission
- [ ] Audit logs cannot be modified, only read

### 7.2 Rate Limiting (future)

- [ ] Rapid requests return 429 after threshold
- [ ] Rate limit headers present: `X-RateLimit-Remaining`

### 7.3 Input Sanitization

- [ ] XSS in search input: `<script>alert(1)</script>` → escaped in UI
- [ ] SQL injection in search: `'; DROP TABLE users; --` → no effect

---

## 8. Browser Compatibility

| Browser | Min Version | Tested |
|---------|-------------|--------|
| Chrome | 90+ | [ ] |
| Firefox | 88+ | [ ] |
| Safari | 14+ | [ ] |
| Edge | 90+ | [ ] |

---

## 9. Accessibility (A11y)

- [ ] All buttons have accessible labels
- [ ] Tables have proper headers
- [ ] Focus trap in modals
- [ ] Color contrast meets WCAG AA
- [ ] Keyboard navigation works (Tab, Enter, Escape)

---

## 10. Performance

| Metric | Target |
|--------|--------|
| `/admin/users` initial load | < 500ms |
| `/admin/operations` with 1000 rows | < 1s |
| Pagination next page | < 300ms |
| No memory leaks on navigation | Heap stable over 10 page switches |

---

## Test Run Log

| Date | Tester | Slices Tested | Pass/Fail | Notes |
|------|--------|---------------|-----------|-------|
| | | | | |

---

## Known Issues

| Issue | Slice | Severity | Status |
|-------|-------|----------|--------|
| | | | |
