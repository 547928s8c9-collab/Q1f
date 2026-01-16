import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Add retry and connection settings for production stability
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10,
});

// Handle connection errors gracefully
pool.on('error', (err) => {
  console.error('Database pool error:', err.message);
  // Don't crash on transient errors like EAI_AGAIN
  if (err.message.includes('EAI_AGAIN')) {
    console.log('Transient DNS error, will retry on next query');
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
