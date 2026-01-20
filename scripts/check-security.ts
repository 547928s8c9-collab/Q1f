#!/usr/bin/env tsx
/**
 * Security audit script for dependencies
 * 
 * This script checks for known vulnerabilities in dependencies
 * and provides recommendations for updates.
 * 
 * Usage:
 *   npm run check:security
 *   or
 *   tsx scripts/check-security.ts
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

console.log("🔒 Running security audit...\n");

try {
  // Run npm audit
  console.log("Running npm audit...");
  const auditOutput = execSync("npm audit --json", { encoding: "utf-8", stdio: "pipe" });
  const audit = JSON.parse(auditOutput);

  if (audit.vulnerabilities) {
    const total = audit.metadata?.vulnerabilities?.total || 0;
    const critical = audit.metadata?.vulnerabilities?.critical || 0;
    const high = audit.metadata?.vulnerabilities?.high || 0;
    const moderate = audit.metadata?.vulnerabilities?.moderate || 0;
    const low = audit.metadata?.vulnerabilities?.low || 0;

    console.log(`\n📊 Security Summary:`);
    console.log(`   Total vulnerabilities: ${total}`);
    console.log(`   Critical: ${critical}`);
    console.log(`   High: ${high}`);
    console.log(`   Moderate: ${moderate}`);
    console.log(`   Low: ${low}\n`);

    if (total > 0) {
      console.log("⚠️  Vulnerabilities found! Review the output above.");
      console.log("\n💡 Recommendations:");
      console.log("   1. Review critical and high severity vulnerabilities first");
      console.log("   2. Run 'npm audit fix' to automatically fix issues");
      console.log("   3. For breaking changes, review changelogs before updating");
      console.log("   4. Test thoroughly after updates\n");
      
      // List critical and high vulnerabilities
      if (critical > 0 || high > 0) {
        console.log("🔴 Critical/High vulnerabilities:");
        for (const [pkg, vuln] of Object.entries(audit.vulnerabilities)) {
          const v = vuln as any;
          if (v.severity === "critical" || v.severity === "high") {
            console.log(`   - ${pkg}: ${v.severity} - ${v.title || "Unknown"}`);
          }
        }
        console.log();
      }

      process.exit(1);
    } else {
      console.log("✅ No vulnerabilities found!\n");
      process.exit(0);
    }
  } else {
    console.log("✅ No vulnerabilities found!\n");
    process.exit(0);
  }
} catch (error: any) {
  if (error.status === 1) {
    // npm audit returns exit code 1 when vulnerabilities are found
    // This is expected, so we already handled it above
    process.exit(1);
  } else {
    console.error("❌ Error running security audit:", error.message);
    console.error("\n💡 Make sure you have run 'npm install' first.");
    process.exit(1);
  }
}
