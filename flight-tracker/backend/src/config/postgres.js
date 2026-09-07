import pg from "pg";

const { Pool } = pg;

export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pgPool.on("error", (err) => {
  console.error("[postgres] unexpected error on idle client:", err.message);
});

export async function query(text, params) {
  const start = Date.now();
  const result = await pgPool.query(text, params);
  const durationMs = Date.now() - start;
  if (durationMs > 200) {
    console.warn(`[postgres] slow query (${durationMs}ms): ${text}`);
  }
  return result;
}
