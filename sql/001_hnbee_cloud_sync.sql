-- HnBee Music Cloud Sync PostgreSQL Schema
-- Run this migration on any PostgreSQL database (Neon, Supabase, or self-hosted Postgres)
-- or let HnBee Music auto-initialize tables when DATABASE_URL is configured.

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

CREATE INDEX IF NOT EXISTS idx_hnbee_liked_tracks_user_pos ON hnbee_liked_tracks(user_id, position);

CREATE TABLE IF NOT EXISTS hnbee_followed_artists (
  user_id TEXT NOT NULL REFERENCES hnbee_users(id) ON DELETE CASCADE,
  artist_id TEXT NOT NULL,
  artist_data JSONB NOT NULL,
  followed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, artist_id)
);
