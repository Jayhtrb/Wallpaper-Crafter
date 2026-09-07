// Manual migration runner for environments where the Postgres container's
// docker-entrypoint-initdb.d auto-load didn't run (e.g. connecting to an
// already-existing DB, or a managed Postgres on Render/RDS). Idempotent —
// every statement in the SQL files uses IF NOT EXISTS.

import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pgPool } from "../config/postgres.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "..", "..", "sql", "001_init.sql");

async function migrate() {
  const sql = readFileSync(sqlPath, "utf8");
  await pgPool.query(sql);
  console.log("[migrate] schema applied from", sqlPath);
  await pgPool.end();
}

migrate().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
