import { db } from "../server/db";
import { whitelistAddresses, AddressStatus } from "../shared/schema";
import { sql } from "drizzle-orm";

async function normalizeWhitelistStatuses() {
  console.log("Normalizing whitelist address statuses...");
  
  const mappings = [
    { from: "active", to: AddressStatus.ACTIVE },
    { from: "pending", to: AddressStatus.PENDING_ACTIVATION },
    { from: "pending_activation", to: AddressStatus.PENDING_ACTIVATION },
    { from: "disabled", to: AddressStatus.DISABLED },
  ];
  
  let totalUpdated = 0;
  
  for (const { from, to } of mappings) {
    const result = await db.execute(sql`
      UPDATE whitelist_addresses 
      SET status = ${to} 
      WHERE LOWER(status) = ${from}
    `);
    
    const count = Number(result.rowCount || 0);
    if (count > 0) {
      console.log(`  Updated ${count} records: "${from}" → "${to}"`);
      totalUpdated += count;
    }
  }
  
  if (totalUpdated === 0) {
    console.log("  No records needed normalization.");
  } else {
    console.log(`\nTotal: ${totalUpdated} records normalized.`);
  }
  
  console.log("Done.");
  process.exit(0);
}

normalizeWhitelistStatuses().catch((err) => {
  console.error("Error normalizing statuses:", err);
  process.exit(1);
});
