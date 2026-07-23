import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type pg from "pg";
import { getPool, closePool } from "./pool.js";

const MIGRATIONS_DIR = join(import.meta.dirname, "migrations");

interface MigrationRow {
  version: number;
  name: string;
  applied_at: Date;
}

async function ensureMigrationsTable(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version   INT PRIMARY KEY,
      name      TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getApplied(pool: pg.Pool): Promise<Map<number, string>> {
  const { rows } = await pool.query<MigrationRow>(
    "SELECT version, name FROM _migrations ORDER BY version",
  );
  return new Map(rows.map((r) => [r.version, r.name]));
}

async function discoverMigrations(): Promise<Array<{ version: number; name: string; sql: string }>> {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const migrations = [];
  for (const file of files) {
    const version = parseInt(file.split("_")[0], 10);
    if (isNaN(version)) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    migrations.push({ version, name: file, sql });
  }
  return migrations;
}

export async function migrate(): Promise<void> {
  const pool = getPool();
  await ensureMigrationsTable(pool);
  const applied = await getApplied(pool);
  const pending = (await discoverMigrations()).filter((m) => !applied.has(m.version));

  if (pending.length === 0) {
    console.log("database: all migrations applied");
    return;
  }

  for (const migration of pending) {
    console.log(`database: applying ${migration.name}`);
    await pool.query("BEGIN");
    try {
      await pool.query(migration.sql);
      await pool.query(
        "INSERT INTO _migrations (version, name) VALUES ($1, $2)",
        [migration.version, migration.name],
      );
      await pool.query("COMMIT");
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
  }

  console.log(`database: applied ${pending.length} migration(s)`);
}

if (process.argv[1] === import.meta.filename) {
  migrate()
    .then(() => closePool())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
