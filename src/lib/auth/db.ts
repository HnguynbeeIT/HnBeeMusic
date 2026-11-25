import { Pool } from "pg";
import type { AuthUser } from "./types";

let pool: Pool | null = null;
let tableInitialized = false;

export function hasDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    });
  }
  return pool;
}

async function ensureUsersTable(): Promise<void> {
  if (tableInitialized) return;
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS hnbee_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  tableInitialized = true;
}

export interface DbUserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  created_at: Date | string;
}

export function toAuthUser(row: DbUserRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    mode: "cloud",
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

export async function findUserByUsername(
  username: string
): Promise<DbUserRow | null> {
  await ensureUsersTable();
  const db = getPool();
  const res = await db.query<DbUserRow>(
    "SELECT id, username, display_name, password_hash, created_at FROM hnbee_users WHERE username = $1 LIMIT 1",
    [username]
  );
  return res.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<DbUserRow | null> {
  await ensureUsersTable();
  const db = getPool();
  const res = await db.query<DbUserRow>(
    "SELECT id, username, display_name, password_hash, created_at FROM hnbee_users WHERE id = $1 LIMIT 1",
    [id]
  );
  return res.rows[0] ?? null;
}

export async function createDbUser(params: {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
}): Promise<DbUserRow> {
  await ensureUsersTable();
  const db = getPool();
  const res = await db.query<DbUserRow>(
    `INSERT INTO hnbee_users (id, username, display_name, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, display_name, password_hash, created_at`,
    [params.id, params.username, params.displayName, params.passwordHash]
  );
  return res.rows[0];
}
