import { db } from "../server/db";
import { sql } from "drizzle-orm";

interface OrphanResult {
  table: string;
  orphanCount: number;
}

async function checkOrphans(): Promise<void> {
  console.log("Checking for orphaned records...\n");

  const checks: Array<{ name: string; query: ReturnType<typeof sql> }> = [
    {
      name: "balances (missing user)",
      query: sql`SELECT COUNT(*) as count FROM balances b WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = b.user_id)`,
    },
    {
      name: "vaults (missing user)",
      query: sql`SELECT COUNT(*) as count FROM vaults v WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = v.user_id)`,
    },
    {
      name: "positions (missing user)",
      query: sql`SELECT COUNT(*) as count FROM positions p WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id)`,
    },
    {
      name: "positions (missing strategy)",
      query: sql`SELECT COUNT(*) as count FROM positions p WHERE NOT EXISTS (SELECT 1 FROM strategies s WHERE s.id = p.strategy_id)`,
    },
    {
      name: "operations (missing user)",
      query: sql`SELECT COUNT(*) as count FROM operations o WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = o.user_id)`,
    },
    {
      name: "operations (missing strategy)",
      query: sql`SELECT COUNT(*) as count FROM operations o WHERE o.strategy_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM strategies s WHERE s.id = o.strategy_id)`,
    },
    {
      name: "redemption_requests (missing user)",
      query: sql`SELECT COUNT(*) as count FROM redemption_requests r WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = r.user_id)`,
    },
    {
      name: "redemption_requests (missing strategy)",
      query: sql`SELECT COUNT(*) as count FROM redemption_requests r WHERE NOT EXISTS (SELECT 1 FROM strategies s WHERE s.id = r.strategy_id)`,
    },
    {
      name: "withdrawals (missing user)",
      query: sql`SELECT COUNT(*) as count FROM withdrawals w WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = w.user_id)`,
    },
    {
      name: "withdrawals (missing operation)",
      query: sql`SELECT COUNT(*) as count FROM withdrawals w WHERE w.operation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operations o WHERE o.id = w.operation_id)`,
    },
    {
      name: "notifications (missing user)",
      query: sql`SELECT COUNT(*) as count FROM notifications n WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = n.user_id)`,
    },
    {
      name: "security_settings (missing user)",
      query: sql`SELECT COUNT(*) as count FROM security_settings s WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id)`,
    },
    {
      name: "kyc_applicants (missing user)",
      query: sql`SELECT COUNT(*) as count FROM kyc_applicants k WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = k.user_id)`,
    },
    {
      name: "whitelist_addresses (missing user)",
      query: sql`SELECT COUNT(*) as count FROM whitelist_addresses w WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = w.user_id)`,
    },
    {
      name: "consents (missing user)",
      query: sql`SELECT COUNT(*) as count FROM consents c WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_id)`,
    },
    {
      name: "audit_logs (missing user)",
      query: sql`SELECT COUNT(*) as count FROM audit_logs a WHERE a.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.user_id)`,
    },
    {
      name: "strategy_performance (missing strategy)",
      query: sql`SELECT COUNT(*) as count FROM strategy_performance sp WHERE NOT EXISTS (SELECT 1 FROM strategies s WHERE s.id = sp.strategy_id)`,
    },
    {
      name: "portfolio_series (missing user)",
      query: sql`SELECT COUNT(*) as count FROM portfolio_series ps WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ps.user_id)`,
    },
    {
      name: "strategy_series (missing strategy)",
      query: sql`SELECT COUNT(*) as count FROM strategy_series ss WHERE NOT EXISTS (SELECT 1 FROM strategies s WHERE s.id = ss.strategy_id)`,
    },
    {
      name: "payout_instructions (missing user)",
      query: sql`SELECT COUNT(*) as count FROM payout_instructions pi WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = pi.user_id)`,
    },
    {
      name: "payout_instructions (missing strategy)",
      query: sql`SELECT COUNT(*) as count FROM payout_instructions pi WHERE NOT EXISTS (SELECT 1 FROM strategies s WHERE s.id = pi.strategy_id)`,
    },
    {
      name: "payout_instructions (missing address)",
      query: sql`SELECT COUNT(*) as count FROM payout_instructions pi WHERE pi.address_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM whitelist_addresses w WHERE w.id = pi.address_id)`,
    },
    {
      name: "idempotency_keys (missing user)",
      query: sql`SELECT COUNT(*) as count FROM idempotency_keys ik WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ik.user_id)`,
    },
    {
      name: "idempotency_keys (missing operation)",
      query: sql`SELECT COUNT(*) as count FROM idempotency_keys ik WHERE ik.operation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operations o WHERE o.id = ik.operation_id)`,
    },
  ];

  const results: OrphanResult[] = [];

  for (const check of checks) {
    try {
      const result = await db.execute(check.query);
      const count = Number((result.rows[0] as { count: string | number }).count);
      results.push({ table: check.name, orphanCount: count });
      if (count > 0) {
        console.log(`  [WARN] ${check.name}: ${count} orphaned records`);
      } else {
        console.log(`  [OK] ${check.name}: 0 orphans`);
      }
    } catch (err) {
      console.log(`  [SKIP] ${check.name}: table may not exist`);
    }
  }

  console.log("\n--- Summary ---");
  const totalOrphans = results.reduce((sum, r) => sum + r.orphanCount, 0);
  if (totalOrphans === 0) {
    console.log("No orphaned records found. Database integrity is good.");
  } else {
    console.log(`Found ${totalOrphans} total orphaned records across tables.`);
    console.log("Consider cleaning up orphaned data before enforcing FK constraints.");
  }
}

checkOrphans()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error checking orphans:", err);
    process.exit(1);
  });
