import { storage } from "./storage";

async function seed() {
  console.log("Seeding database...");
  try {
    await storage.seedStrategies();
    console.log("Strategies seeded successfully");
  } catch (error) {
    console.error("Seed error:", error);
    process.exit(1);
  }
  process.exit(0);
}

seed();
