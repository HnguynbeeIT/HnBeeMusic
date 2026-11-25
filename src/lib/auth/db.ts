import { Pool } from "pg";
import type { UnifiedTrack } from "@/lib/audio/types";
import type { UserPlaylist } from "@/store/usePlaylistStore";
import type { FollowedArtist } from "@/store/useArtistStore";
import type { AuthUser } from "./types";

let pool: Pool | null = null;
let schemaInitialized = false;

export interface DbUserRow {
  id: string;
  username: string;
  email?: string | null;
  display_name: string;
  avatar_url?: string | null;
  region?: string | null;
  password_hash: string;
  created_at: Date | string;
  updated_at?: Date | string;
}

export interface UserCloudSyncSnapshot {
  profile: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
    region: string;
    updatedAt: string;
  };
  playlists: UserPlaylist[];
  likedTracks: UnifiedTrack[];
  followedArtists: FollowedArtist[];
  syncedAt: string;
}

function hasPgUrl(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function hasSupabaseRpc(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_ANON_KEY?.trim() &&
      process.env.HNBEE_SYNC_SECRET?.trim()
  );
}

/**
 * Returns true when either direct PostgreSQL (DATABASE_URL) or Supabase Cloud Sync
 * (SUPABASE_URL + SUPABASE_ANON_KEY + HNBEE_SYNC_SECRET) is configured.
 */
export function hasDatabaseConfigured(): boolean {
  return hasPgUrl() || hasSupabaseRpc();
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

async function callSupabaseRpc<T>(
  fnName: string,
  params: Record<string, unknown>
): Promise<T> {
  const baseUrl = process.env.SUPABASE_URL!.trim().replace(/\/+$/, "");
  const apiKey = process.env.SUPABASE_ANON_KEY!.trim();
  const secret = process.env.HNBEE_SYNC_SECRET!.trim();

  const res = await fetch(`${baseUrl}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ p_secret: secret, ...params }),
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Supabase RPC ${fnName} failed (${res.status}): ${errText}`);
  }

  return (await res.json()) as T;
}

async function ensurePgSchema(): Promise<void> {
  if (schemaInitialized) return;
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS hnbee_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      region TEXT NOT NULL DEFAULT 'VN',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS hnbee_playlists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES hnbee_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_hnbee_playlists_user_id ON hnbee_playlists(user_id);
    CREATE TABLE IF NOT EXISTS hnbee_playlist_tracks (
      playlist_id TEXT NOT NULL REFERENCES hnbee_playlists(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      track_id TEXT NOT NULL,
      track_data JSONB NOT NULL,
      PRIMARY KEY (playlist_id, position)
    );
    CREATE TABLE IF NOT EXISTS hnbee_liked_tracks (
      user_id TEXT NOT NULL REFERENCES hnbee_users(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      track_id TEXT NOT NULL,
      track_data JSONB NOT NULL,
      liked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, track_id)
    );
    CREATE TABLE IF NOT EXISTS hnbee_followed_artists (
      user_id TEXT NOT NULL REFERENCES hnbee_users(id) ON DELETE CASCADE,
      artist_id TEXT NOT NULL,
      artist_data JSONB NOT NULL,
      followed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, artist_id)
    );
  `);
  schemaInitialized = true;
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
  if (hasPgUrl()) {
    await ensurePgSchema();
    const res = await getPool().query<DbUserRow>(
      "SELECT id, username, email, display_name, avatar_url, region, password_hash, created_at, updated_at FROM hnbee_users WHERE username = $1 LIMIT 1",
      [username]
    );
    return res.rows[0] ?? null;
  }

  if (hasSupabaseRpc()) {
    return callSupabaseRpc<DbUserRow | null>("hnbee_find_user", {
      p_username: username,
    });
  }

  return null;
}

export async function findUserById(id: string): Promise<DbUserRow | null> {
  if (hasPgUrl()) {
    await ensurePgSchema();
    const res = await getPool().query<DbUserRow>(
      "SELECT id, username, email, display_name, avatar_url, region, password_hash, created_at, updated_at FROM hnbee_users WHERE id = $1 LIMIT 1",
      [id]
    );
    return res.rows[0] ?? null;
  }

  if (hasSupabaseRpc()) {
    return callSupabaseRpc<DbUserRow | null>("hnbee_find_user", {
      p_id: id,
    });
  }

  return null;
}

export async function createDbUser(params: {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  region?: string;
}): Promise<DbUserRow> {
  if (hasPgUrl()) {
    await ensurePgSchema();
    const res = await getPool().query<DbUserRow>(
      `INSERT INTO hnbee_users (id, username, display_name, password_hash, region)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, display_name, avatar_url, region, password_hash, created_at, updated_at`,
      [
        params.id,
        params.username,
        params.displayName,
        params.passwordHash,
        params.region || "VN",
      ]
    );
    return res.rows[0];
  }

  return callSupabaseRpc<DbUserRow>("hnbee_create_user", {
    p_id: params.id,
    p_username: params.username,
    p_display_name: params.displayName,
    p_password_hash: params.passwordHash,
    p_region: params.region || "VN",
  });
}

export async function getUserCloudSync(
  userId: string
): Promise<UserCloudSyncSnapshot | null> {
  if (hasPgUrl()) {
    await ensurePgSchema();
    const db = getPool();
    const userRes = await db.query<DbUserRow>(
      "SELECT id, username, display_name, avatar_url, region, updated_at FROM hnbee_users WHERE id = $1 LIMIT 1",
      [userId]
    );
    const u = userRes.rows[0];
    if (!u) return null;

    const plRes = await db.query<{
      id: string;
      name: string;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      "SELECT id, name, created_at, updated_at FROM hnbee_playlists WHERE user_id = $1 ORDER BY updated_at DESC",
      [userId]
    );

    const playlists: UserPlaylist[] = [];
    for (const pl of plRes.rows) {
      const trRes = await db.query<{ track_data: UnifiedTrack }>(
        "SELECT track_data FROM hnbee_playlist_tracks WHERE playlist_id = $1 ORDER BY position ASC",
        [pl.id]
      );
      playlists.push({
        id: pl.id,
        name: pl.name,
        tracks: trRes.rows.map((r) => r.track_data),
        createdAt:
          pl.created_at instanceof Date
            ? pl.created_at.toISOString()
            : String(pl.created_at),
        updatedAt:
          pl.updated_at instanceof Date
            ? pl.updated_at.toISOString()
            : String(pl.updated_at),
      });
    }

    const likedRes = await db.query<{ track_data: UnifiedTrack }>(
      "SELECT track_data FROM hnbee_liked_tracks WHERE user_id = $1 ORDER BY position ASC",
      [userId]
    );

    const artistRes = await db.query<{ artist_data: FollowedArtist }>(
      "SELECT artist_data FROM hnbee_followed_artists WHERE user_id = $1 ORDER BY followed_at DESC",
      [userId]
    );

    return {
      profile: {
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        avatarUrl: u.avatar_url ?? null,
        region: u.region || "VN",
        updatedAt:
          u.updated_at instanceof Date
            ? u.updated_at.toISOString()
            : String(u.updated_at || new Date().toISOString()),
      },
      playlists,
      likedTracks: likedRes.rows.map((r) => r.track_data),
      followedArtists: artistRes.rows.map((r) => r.artist_data),
      syncedAt: new Date().toISOString(),
    };
  }

  if (hasSupabaseRpc()) {
    return callSupabaseRpc<UserCloudSyncSnapshot | null>("hnbee_get_user_sync", {
      p_user_id: userId,
    });
  }

  return null;
}

export async function saveUserCloudSync(params: {
  userId: string;
  region?: string;
  displayName?: string;
  playlists?: UserPlaylist[];
  likedTracks?: UnifiedTrack[];
  followedArtists?: FollowedArtist[];
}): Promise<{ synced: boolean; syncedAt: string }> {
  if (hasPgUrl()) {
    await ensurePgSchema();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE hnbee_users
         SET region = COALESCE($2, region),
             display_name = COALESCE($3, display_name),
             updated_at = NOW()
         WHERE id = $1`,
        [params.userId, params.region || null, params.displayName || null]
      );

      if (Array.isArray(params.playlists)) {
        await client.query("DELETE FROM hnbee_playlists WHERE user_id = $1", [
          params.userId,
        ]);
        for (const pl of params.playlists) {
          await client.query(
            `INSERT INTO hnbee_playlists (id, user_id, name, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = EXCLUDED.updated_at`,
            [
              pl.id,
              params.userId,
              pl.name || "Playlist mới",
              pl.createdAt || new Date().toISOString(),
              pl.updatedAt || new Date().toISOString(),
            ]
          );
          for (let i = 0; i < (pl.tracks || []).length; i++) {
            const tr = pl.tracks[i];
            await client.query(
              `INSERT INTO hnbee_playlist_tracks (playlist_id, position, track_id, track_data)
               VALUES ($1, $2, $3, $4::jsonb)
               ON CONFLICT (playlist_id, position) DO UPDATE SET track_data = EXCLUDED.track_data`,
              [pl.id, i, tr.id || `tr:${i}`, JSON.stringify(tr)]
            );
          }
        }
      }

      if (Array.isArray(params.likedTracks)) {
        await client.query(
          "DELETE FROM hnbee_liked_tracks WHERE user_id = $1",
          [params.userId]
        );
        for (let i = 0; i < params.likedTracks.length; i++) {
          const tr = params.likedTracks[i];
          await client.query(
            `INSERT INTO hnbee_liked_tracks (user_id, position, track_id, track_data)
             VALUES ($1, $2, $3, $4::jsonb)
             ON CONFLICT (user_id, track_id) DO UPDATE SET position = EXCLUDED.position, track_data = EXCLUDED.track_data`,
            [params.userId, i, tr.id || `lk:${i}`, JSON.stringify(tr)]
          );
        }
      }

      if (Array.isArray(params.followedArtists)) {
        await client.query(
          "DELETE FROM hnbee_followed_artists WHERE user_id = $1",
          [params.userId]
        );
        for (const art of params.followedArtists) {
          await client.query(
            `INSERT INTO hnbee_followed_artists (user_id, artist_id, artist_data, followed_at)
             VALUES ($1, $2, $3::jsonb, $4)
             ON CONFLICT (user_id, artist_id) DO UPDATE SET artist_data = EXCLUDED.artist_data`,
            [
              params.userId,
              art.id || art.name.toLowerCase(),
              JSON.stringify(art),
              art.followedAt || new Date().toISOString(),
            ]
          );
        }
      }

      await client.query("COMMIT");
      return { synced: true, syncedAt: new Date().toISOString() };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  if (hasSupabaseRpc()) {
    return callSupabaseRpc<{ synced: boolean; syncedAt: string }>(
      "hnbee_save_user_sync",
      {
        p_user_id: params.userId,
        p_region: params.region ?? null,
        p_display_name: params.displayName ?? null,
        p_playlists: params.playlists ?? null,
        p_liked_tracks: params.likedTracks ?? null,
        p_followed_artists: params.followedArtists ?? null,
      }
    );
  }

  return { synced: false, syncedAt: new Date().toISOString() };
}
