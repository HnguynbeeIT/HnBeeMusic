"use client";

import { create } from "zustand";
import type { UnifiedTrack } from "@/lib/audio/types";
import type { LyricsResult } from "@/lib/lyrics";

export type LyricsFontSize = "sm" | "md" | "lg";

interface LyricsState {
  trackId: string | null;
  lyrics: LyricsResult | null;
  loading: boolean;
  hasLyrics: boolean;
  fontSize: LyricsFontSize;
  isFullScreenLyrics: boolean;
  cache: Record<string, LyricsResult>;

  setFontSize: (size: LyricsFontSize) => void;
  setFullScreenLyrics: (open: boolean) => void;
  fetchForTrack: (track: UnifiedTrack | null, fallbackDuration?: number) => Promise<void>;
}

export const useLyricsStore = create<LyricsState>()((set, get) => ({
  trackId: null,
  lyrics: null,
  loading: false,
  hasLyrics: false,
  fontSize: "md",
  isFullScreenLyrics: false,
  cache: {},

  setFontSize: (fontSize) => set({ fontSize }),
  setFullScreenLyrics: (isFullScreenLyrics) => set({ isFullScreenLyrics }),

  fetchForTrack: async (track, fallbackDuration = 0) => {
    if (!track) {
      set({ trackId: null, lyrics: null, loading: false, hasLyrics: false });
      return;
    }

    const cached = get().cache[track.id];
    if (cached) {
      set({
        trackId: track.id,
        lyrics: cached,
        loading: false,
        hasLyrics: Boolean(cached.synced.length > 0 || cached.plain),
      });
      return;
    }

    set({ trackId: track.id, lyrics: null, loading: true, hasLyrics: false });

    try {
      const params = new URLSearchParams({
        id: track.id,
        title: track.title,
        artist: track.artist,
        duration: String(Math.round(track.duration || fallbackDuration || 0)),
      });

      const res = await fetch(`/api/lyrics?${params.toString()}`);
      const data = (await res.json()) as LyricsResult;

      // Guard against stale responses if user already switched tracks
      if (get().trackId !== track.id) return;

      const found = Boolean(data.synced?.length > 0 || data.plain);
      set((s) => ({
        lyrics: data,
        loading: false,
        hasLyrics: found,
        cache: { ...s.cache, [track.id]: data },
      }));
    } catch {
      if (get().trackId !== track.id) return;
      set({
        lyrics: { synced: [], plain: null, instrumental: false, source: "none" },
        loading: false,
        hasLyrics: false,
      });
    }
  },
}));
