-- Read-only diagnostics for orphans and duplicates.
-- No UPDATE/DELETE statements are included.

-- ==================== A) ORPHANS ====================

SELECT
  'orphan: sim_sessions.user_id' AS check_name,
  COUNT(*) AS orphan_count,
  array_agg(s.id) AS ids
FROM sim_sessions s
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id);

SELECT
  'orphan: sim_events.session_id' AS check_name,
  COUNT(*) AS orphan_count,
  array_agg(e.id) AS ids
FROM sim_events e
WHERE NOT EXISTS (SELECT 1 FROM sim_sessions s WHERE s.id = e.session_id);

SELECT
  'orphan: admin_users.user_id' AS check_name,
  COUNT(*) AS orphan_count,
  array_agg(a.id) AS ids
FROM admin_users a
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.user_id);

SELECT
  'orphan: admin_user_roles.admin_user_id' AS check_name,
  COUNT(*) AS orphan_count,
  array_agg(aur.id) AS ids
FROM admin_user_roles aur
WHERE NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.id = aur.admin_user_id);

SELECT
  'orphan: admin_user_roles.role_id' AS check_name,
  COUNT(*) AS orphan_count,
  array_agg(aur.id) AS ids
FROM admin_user_roles aur
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = aur.role_id);

SELECT
  'orphan: role_permissions.role_id' AS check_name,
  COUNT(*) AS orphan_count,
  array_agg(rp.id) AS ids
FROM role_permissions rp
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = rp.role_id);

SELECT
  'orphan: role_permissions.permission_id' AS check_name,
  COUNT(*) AS orphan_count,
  array_agg(rp.id) AS ids
FROM role_permissions rp
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.id = rp.permission_id);

SELECT
  'orphan: admin_audit_logs.actor_admin_user_id' AS check_name,
  COUNT(*) AS orphan_count,
  array_agg(l.id) AS ids
FROM admin_audit_logs l
WHERE NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.id = l.actor_admin_user_id);

SELECT
  'orphan: admin_idempotency_keys.actor_admin_user_id' AS check_name,
  COUNT(*) AS orphan_count,
  array_agg(k.id) AS ids
FROM admin_idempotency_keys k
WHERE NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.id = k.actor_admin_user_id);

SELECT
  'orphan: pending_admin_actions.maker_admin_user_id' AS check_name,
  COUNT(*) AS orphan_count,
  array_agg(p.id) AS ids
FROM pending_admin_actions p
WHERE NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.id = p.maker_admin_user_id);

SELECT
  'orphan: pending_admin_actions.checker_admin_user_id' AS check_name,
  COUNT(*) AS orphan_count,
  array_agg(p.id) AS ids
FROM pending_admin_actions p
WHERE p.checker_admin_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.id = p.checker_admin_user_id);

SELECT
  'orphan: admin_inbox_items.owner_admin_user_id' AS check_name,
  COUNT(*) AS orphan_count,
  array_agg(i.id) AS ids
FROM admin_inbox_items i
WHERE i.owner_admin_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.id = i.owner_admin_user_id);

SELECT
  'orphan: admin_inbox_items.resolved_by_admin_user_id' AS check_name,
  COUNT(*) AS orphan_count,
  array_agg(i.id) AS ids
FROM admin_inbox_items i
WHERE i.resolved_by_admin_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.id = i.resolved_by_admin_user_id);

SELECT
  'orphan: admin_inbox_items.user_id' AS check_name,
  COUNT(*) AS orphan_count,
  array_agg(i.id) AS ids
FROM admin_inbox_items i
WHERE i.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = i.user_id);

SELECT
  'orphan: incidents.created_by_admin_user_id' AS check_name,
  COUNT(*) AS orphan_count,
  array_agg(i.id) AS ids
FROM incidents i
WHERE NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.id = i.created_by_admin_user_id);

SELECT
  'orphan: incidents.resolved_by_admin_user_id' AS check_name,
  COUNT(*) AS orphan_count,
  array_agg(i.id) AS ids
FROM incidents i
WHERE i.resolved_by_admin_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.id = i.resolved_by_admin_user_id);

-- ==================== B) DUPLICATES ====================

SELECT
  'dupe: balances(user_id, asset)' AS check_name,
  user_id,
  asset,
  COUNT(*) AS duplicate_count,
  array_agg(id) AS ids
FROM balances
GROUP BY user_id, asset
HAVING COUNT(*) > 1;

SELECT
  'dupe: vaults(user_id, type)' AS check_name,
  user_id,
  type,
  COUNT(*) AS duplicate_count,
  array_agg(id) AS ids
FROM vaults
GROUP BY user_id, type
HAVING COUNT(*) > 1;

SELECT
  'dupe: positions(user_id, strategy_id)' AS check_name,
  user_id,
  strategy_id,
  COUNT(*) AS duplicate_count,
  array_agg(id) AS ids
FROM positions
GROUP BY user_id, strategy_id
HAVING COUNT(*) > 1;

SELECT
  'dupe: payout_instructions(user_id, strategy_id)' AS check_name,
  user_id,
  strategy_id,
  COUNT(*) AS duplicate_count,
  array_agg(id) AS ids
FROM payout_instructions
GROUP BY user_id, strategy_id
HAVING COUNT(*) > 1;

SELECT
  'dupe: whitelist_addresses(user_id, address)' AS check_name,
  user_id,
  address,
  COUNT(*) AS duplicate_count,
  array_agg(id) AS ids
FROM whitelist_addresses
GROUP BY user_id, address
HAVING COUNT(*) > 1;

SELECT
  'dupe: portfolio_series(user_id, date)' AS check_name,
  user_id,
  date,
  COUNT(*) AS duplicate_count,
  array_agg(id) AS ids
FROM portfolio_series
GROUP BY user_id, date
HAVING COUNT(*) > 1;

SELECT
  'dupe: strategy_series(strategy_id, date)' AS check_name,
  strategy_id,
  date,
  COUNT(*) AS duplicate_count,
  array_agg(id) AS ids
FROM strategy_series
GROUP BY strategy_id, date
HAVING COUNT(*) > 1;
