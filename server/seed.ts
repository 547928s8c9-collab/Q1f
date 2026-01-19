import { storage } from "./storage";
import { db } from "./db";
import { users, adminUsers, adminUserRoles, roles } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const ADMIN_SUPER_EMAIL = process.env.ADMIN_SUPER_EMAIL;
const ADMIN_SUPER_ENABLED = process.env.ADMIN_SUPER_ENABLED !== "false";

async function ensureSuperAdmin(): Promise<void> {
  if (!ADMIN_SUPER_ENABLED) {
    console.log("SuperAdmin seeding disabled (ADMIN_SUPER_ENABLED=false)");
    return;
  }

  if (!ADMIN_SUPER_EMAIL) {
    console.log("SuperAdmin seeding skipped: ADMIN_SUPER_EMAIL not set");
    return;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, ADMIN_SUPER_EMAIL))
    .limit(1);

  if (!user) {
    console.log(`SuperAdmin seeding skipped: User with email ${ADMIN_SUPER_EMAIL} not found in users table`);
    console.log("  → User must log in first to create their account");
    return;
  }

  let [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.userId, user.id))
    .limit(1);

  if (!admin) {
    const [created] = await db
      .insert(adminUsers)
      .values({
        userId: user.id,
        email: user.email,
        isActive: true,
      })
      .returning();
    admin = created;
    console.log(`SuperAdmin created: adminUserId=${admin.id}`);
  } else if (!admin.isActive) {
    await db
      .update(adminUsers)
      .set({ isActive: true, email: user.email })
      .where(eq(adminUsers.id, admin.id));
    console.log(`SuperAdmin reactivated: adminUserId=${admin.id}`);
  }

  const [superAdminRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.key, "super_admin"))
    .limit(1);

  if (!superAdminRole) {
    console.log("SuperAdmin role not found - run RBAC seed first");
    return;
  }

  const [existingRoleAssign] = await db
    .select()
    .from(adminUserRoles)
    .where(
      and(
        eq(adminUserRoles.adminUserId, admin.id),
        eq(adminUserRoles.roleId, superAdminRole.id)
      )
    )
    .limit(1);

  if (!existingRoleAssign) {
    await db.insert(adminUserRoles).values({
      adminUserId: admin.id,
      roleId: superAdminRole.id,
    });
    console.log(`SuperAdmin role assigned to adminUserId=${admin.id}`);
  }

  console.log(`SuperAdmin ensured: adminUserId=${admin.id}, email=${ADMIN_SUPER_EMAIL}`);
}

async function seed() {
  console.log("Seeding database...");
  try {
    const strategiesResult = await storage.seedStrategies();
    console.log(`Strategies seeded successfully (inserted=${strategiesResult.inserted}, updated=${strategiesResult.updated})`);

    const profilesResult = await storage.seedStrategyProfiles();
    console.log(`Strategy profiles seeded successfully (inserted=${profilesResult.inserted}, updated=${profilesResult.updated})`);

    await storage.seedAdminRbac();
    console.log("Admin RBAC (roles, permissions, mappings) seeded successfully");

    await ensureSuperAdmin();
  } catch (error) {
    console.error("Seed error:", error);
    process.exit(1);
  }
  process.exit(0);
}

seed();
