"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UnifiedTrack } from "@/lib/audio/types";

export interface UserPlaylist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  tracks: UnifiedTrack[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlaylistInput {
  name: string;
  description?: string;
  coverUrl?: string;
  tracks?: UnifiedTrack[];
}

interface PlaylistState {
  playlists: UserPlaylist[];
  isCreateModalOpen: boolean;
  createModalSeedTrack: UnifiedTrack | null;

  openCreateModal: (seedTrack?: UnifiedTrack) => void;
  closeCreateModal: () => void;
  createPlaylist: (
    input: string | CreatePlaylistInput,
    initialTrack?: UnifiedTrack
  ) => UserPlaylist;
  updatePlaylist: (
    id: string,
    patch: { name?: string; description?: string; coverUrl?: string }
  ) => void;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addTrackToPlaylist: (playlistId: string, track: UnifiedTrack) => boolean;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  reorderTrackInPlaylist: (
    playlistId: string,
    fromIndex: number,
    toIndex: number
  ) => void;
  setPlaylists: (playlists: UserPlaylist[]) => void;
  syncFromCloud: () => Promise<void>;
}

export const usePlaylistStore = create<PlaylistState>()(
  persist(
    (set, get) => ({
      playlists: [],
      isCreateModalOpen: false,
      createModalSeedTrack: null,

      openCreateModal: (seedTrack) =>
        set({
          isCreateModalOpen: true,
          createModalSeedTrack: seedTrack ?? null,
        }),

      closeCreateModal: () =>
        set({
          isCreateModalOpen: false,
          createModalSeedTrack: null,
        }),

      createPlaylist: (input, initialTrack) => {
        const opts: CreatePlaylistInput =
          typeof input === "string"
            ? { name: input, tracks: initialTrack ? [initialTrack] : [] }
            : input;

        const name = opts.name.trim() || "Playlist mới";
        const now = new Date().toISOString();
        const dedupedTracks: UnifiedTrack[] = [];
        const seen = new Set<string>();
        const rawTracks = [
          ...(opts.tracks ?? []),
          ...(initialTrack && typeof input !== "string" ? [initialTrack] : []),
        ];
        for (const t of rawTracks) {
          if (t?.id && !seen.has(t.id)) {
            seen.add(t.id);
            dedupedTracks.push(t);
          }
        }

        const created: UserPlaylist = {
          id: `upl:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name,
          ...(opts.description?.trim()
            ? { description: opts.description.trim() }
            : {}),
          ...(opts.coverUrl?.trim() ? { coverUrl: opts.coverUrl.trim() } : {}),
          tracks: dedupedTracks,
          createdAt: now,
          updatedAt: now,
        };
        const next = [created, ...get().playlists];
        set({ playlists: next });
        return created;
      },

      updatePlaylist: (id, patch) => {
        const next = get().playlists.map((pl) => {
          if (pl.id !== id) return pl;
          return {
            ...pl,
            ...(patch.name !== undefined && patch.name.trim()
              ? { name: patch.name.trim() }
              : {}),
            ...(patch.description !== undefined
              ? { description: patch.description.trim() || undefined }
              : {}),
            ...(patch.coverUrl !== undefined
              ? { coverUrl: patch.coverUrl.trim() || undefined }
              : {}),
            updatedAt: new Date().toISOString(),
          };
        });
        set({ playlists: next });
      },

      renamePlaylist: (id, rawName) => {
        const name = rawName.trim();
        if (!name) return;
        get().updatePlaylist(id, { name });
      },

      deletePlaylist: (id) => {
        const next = get().playlists.filter((pl) => pl.id !== id);
        set({ playlists: next });
      },

      addTrackToPlaylist: (playlistId, track) => {
        let added = false;
        const next = get().playlists.map((pl) => {
          if (pl.id !== playlistId) return pl;
          if (pl.tracks.some((t) => t.id === track.id)) return pl;
          added = true;
          return {
            ...pl,
            tracks: [...pl.tracks, track],
            updatedAt: new Date().toISOString(),
          };
        });
        if (added) {
          set({ playlists: next });
        }
        return added;
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
      },

      reorderTrackInPlaylist: (playlistId, fromIndex, toIndex) => {
        const next = get().playlists.map((pl) => {
          if (pl.id !== playlistId) return pl;
          if (
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= pl.tracks.length ||
            toIndex >= pl.tracks.length ||
            fromIndex === toIndex
          ) {
            return pl;
          }
          const copy = [...pl.tracks];
          const [moved] = copy.splice(fromIndex, 1);
          copy.splice(toIndex, 0, moved);
          return {
            ...pl,
            tracks: copy,
            updatedAt: new Date().toISOString(),
          };
        });
        set({ playlists: next });
      },

      setPlaylists: (playlists) => {
        set({ playlists });
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
      partialize: (state) => ({
        playlists: state.playlists,
      }),
    }
  )
);
