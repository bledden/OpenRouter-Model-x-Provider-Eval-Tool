import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./drizzle/schema";

// Get database URL from environment
const getDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn(
      "DATABASE_URL not set, using default local connection. Set DATABASE_URL for production."
    );
    return "postgresql://eval:evalpass@localhost:5432/eval_db";
  }
  return url;
};

// Create connection pool with sensible defaults
const createPool = () => {
  return new Pool({
    connectionString: getDatabaseUrl(),
    max: 10, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection could not be established
  });
};

// Singleton pool instance
let pool: Pool | null = null;

const getPool = (): Pool => {
  if (!pool) {
    pool = createPool();
  }
  return pool;
};

// Create drizzle instance with schema
export const db = drizzle(getPool(), { schema });

// Export pool for direct access if needed
export { getPool };

// Graceful shutdown helper
export const closeDb = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

// Health check helper
export const checkDbHealth = async (): Promise<boolean> => {
  try {
    const client = await getPool().connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch {
    return false;
  }
};

// Re-export schema types for convenience
export * from "./drizzle/schema";
