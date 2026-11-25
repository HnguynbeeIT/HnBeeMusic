"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UnifiedTrack } from "@/lib/audio/types";

export interface UserPlaylist {
  id: string;
  name: string;
  tracks: UnifiedTrack[];
  createdAt: string;
  updatedAt: string;
}

interface PlaylistState {
  playlists: UserPlaylist[];
  createPlaylist: (name: string, initialTrack?: UnifiedTrack) => UserPlaylist;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addTrackToPlaylist: (playlistId: string, track: UnifiedTrack) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  setPlaylists: (playlists: UserPlaylist[]) => void;
  syncFromCloud: () => Promise<void>;
}

function pushPlaylistsToCloud() {
  // Unified 500ms debounced Cloud Sync is orchestrated by CloudSyncManager (/api/user/sync).
}

export const usePlaylistStore = create<PlaylistState>()(
  persist(
    (set, get) => ({
      playlists: [],

      createPlaylist: (rawName, initialTrack) => {
        const name = rawName.trim() || "Playlist mới";
        const now = new Date().toISOString();
        const created: UserPlaylist = {
          id: `upl:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name,
          tracks: initialTrack ? [initialTrack] : [],
          createdAt: now,
          updatedAt: now,
        };
        const next = [created, ...get().playlists];
        set({ playlists: next });
        pushPlaylistsToCloud();
        return created;
      },

      renamePlaylist: (id, rawName) => {
        const name = rawName.trim();
        if (!name) return;
        const next = get().playlists.map((pl) =>
          pl.id === id
            ? { ...pl, name, updatedAt: new Date().toISOString() }
            : pl
        );
        set({ playlists: next });
        pushPlaylistsToCloud();
      },

      deletePlaylist: (id) => {
        const next = get().playlists.filter((pl) => pl.id !== id);
        set({ playlists: next });
        pushPlaylistsToCloud();
      },

      addTrackToPlaylist: (playlistId, track) => {
        const next = get().playlists.map((pl) => {
          if (pl.id !== playlistId) return pl;
          if (pl.tracks.some((t) => t.id === track.id)) return pl;
          return {
            ...pl,
            tracks: [...pl.tracks, track],
            updatedAt: new Date().toISOString(),
          };
        });
        set({ playlists: next });
        pushPlaylistsToCloud();
      },

      removeTrackFromPlaylist: (playlistId, trackId) => {
        const next = get().playlists.map((pl) => {
          if (pl.id !== playlistId) return pl;
          return {
            ...pl,
            tracks: pl.tracks.filter((t) => t.id !== trackId),
            updatedAt: new Date().toISOString(),
          };
        });
        set({ playlists: next });
        pushPlaylistsToCloud();
      },

      setPlaylists: (playlists) => {
        set({ playlists });
        pushPlaylistsToCloud();
      },

      syncFromCloud: async () => {
        try {
          const res = await fetch("/api/playlists", { cache: "no-store" });
          if (!res.ok) return;
          const data = (await res.json()) as {
            synced?: boolean;
            playlists?: UserPlaylist[];
          };
          if (data.synced && Array.isArray(data.playlists)) {
            set({ playlists: data.playlists });
          }
        } catch {}
      },
    }),
    {
      name: "hnbeemusic-user-playlists",
    }
  )
);
