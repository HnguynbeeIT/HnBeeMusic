import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { hasDatabaseConfigured } from "@/lib/auth/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/jwt";

let pool: Pool | null = null;
let tableReady = false;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  }
  return pool;
}

async function ensurePlaylistsTable() {
  if (tableReady) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS hnbee_user_playlists (
      user_id TEXT PRIMARY KEY,
      playlists JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  tableReady = true;
}

export async function GET(request: NextRequest) {
  if (!hasDatabaseConfigured()) {
    return NextResponse.json({ synced: false, playlists: [] });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ synced: false, playlists: [] });
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return NextResponse.json({ synced: false, playlists: [] });
  }

  try {
    await ensurePlaylistsTable();
    const res = await getPool().query<{ playlists: unknown[] }>(
      "SELECT playlists FROM hnbee_user_playlists WHERE user_id = $1 LIMIT 1",
      [payload.sub]
    );
    return NextResponse.json({
      synced: true,
      playlists: res.rows[0]?.playlists ?? [],
    });
  } catch (error) {
    console.error("[api/playlists] GET error:", error);
    return NextResponse.json({ synced: false, playlists: [] });
  }
}

export async function PUT(request: NextRequest) {
  if (!hasDatabaseConfigured()) {
    return NextResponse.json({ synced: false });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ synced: false });
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return NextResponse.json({ synced: false });
  }

  try {
    const body = (await request.json()) as { playlists?: unknown[] };
    const playlists = Array.isArray(body.playlists) ? body.playlists : [];
    await ensurePlaylistsTable();
    await getPool().query(
      `INSERT INTO hnbee_user_playlists (user_id, playlists, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET playlists = EXCLUDED.playlists, updated_at = NOW()`,
      [payload.sub, JSON.stringify(playlists)]
    );
    return NextResponse.json({ synced: true });
  } catch (error) {
    console.error("[api/playlists] PUT error:", error);
    return NextResponse.json({ synced: false }, { status: 500 });
  }
}
