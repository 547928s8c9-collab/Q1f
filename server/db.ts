import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { logger } from "./lib/logger";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const isTest = process.env.NODE_ENV === "test";

if (!databaseUrl && !isTest) {
  throw new Error("DATABASE_URL must be set");
}

export const pool = new Pool({
  connectionString: databaseUrl ?? "postgres://localhost:5432/postgres",
  // Add retry and connection settings for production stability
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10,
});

// Handle connection errors gracefully
pool.on('error', (err) => {
  logger.error('Database pool error', "db", { message: err.message }, err);
  // Don't crash on transient errors like EAI_AGAIN
  if (err.message.includes('EAI_AGAIN')) {
    logger.info('Transient DNS error, will retry on next query', "db");
  }
});

export const db = drizzle(pool, { schema });

// Export transaction helper for atomic operations
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function withTransaction<T>(
  fn: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  return db.transaction(fn);
}
