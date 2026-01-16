import { storage } from "./storage";

async function seed() {
  console.log("Seeding database...");
  try {
    await storage.seedStrategies();
    console.log("Strategies seeded successfully");

    await storage.seedStrategyProfiles();
    console.log("Strategy profiles seeded successfully");

    await storage.seedAdminRbac();
    console.log("Admin RBAC (roles, permissions, mappings) seeded successfully");
  } catch (error) {
    console.error("Seed error:", error);
    process.exit(1);
  }
  process.exit(0);
}

seed();
