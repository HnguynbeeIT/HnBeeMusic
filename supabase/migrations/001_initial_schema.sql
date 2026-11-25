-- ============================================================
-- HnBeeMusic Initial Database Schema (Supabase PostgreSQL)
-- Phase 3 ready: Playlists, Liked Songs, Listening History + RLS
-- ============================================================

create extension if not exists "pgcrypto";

-- 1. User Playlists
create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text default '',
  cover_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Playlist Tracks (Normalized UnifiedTrack snapshot)
create table if not exists public.playlist_tracks (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  track_id text not null,
  title text not null,
  artist text not null,
  thumbnail text not null default '',
  duration integer not null default 0,
  source text not null check (source in ('youtube', 'soundcloud', 'spotify')),
  source_url text not null,
  stream_url text,
  position integer not null default 0,
  added_at timestamptz not null default now()
);

-- 3. Liked Songs
create table if not exists public.liked_songs (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null,
  track_data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

-- 4. Listening History
create table if not exists public.listening_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null,
  track_data jsonb not null,
  played_at timestamptz not null default now()
);

create index if not exists idx_playlists_user on public.playlists(user_id);
create index if not exists idx_playlist_tracks_playlist on public.playlist_tracks(playlist_id, position);
create index if not exists idx_listening_history_user_played on public.listening_history(user_id, played_at desc);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;
alter table public.liked_songs enable row level security;
alter table public.listening_history enable row level security;

create policy "Users manage own playlists"
  on public.playlists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage tracks in own playlists"
  on public.playlist_tracks for all
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_tracks.playlist_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_tracks.playlist_id and p.user_id = auth.uid()
    )
  );

create policy "Users manage own liked songs"
  on public.liked_songs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own listening history"
  on public.listening_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
