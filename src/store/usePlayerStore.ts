"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  RepeatMode,
  TrackSource,
  UnifiedTrack,
} from "@/lib/audio/types";

interface PlayerState {
  currentTrack: UnifiedTrack | null;
  sourceType: TrackSource | null;
  queue: UnifiedTrack[];
  queueIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number; // 0..100
  isMuted: boolean;
  progress: number; // seconds
  duration: number; // seconds
  seekTarget: number | null;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  isQueueOpen: boolean;
  isLyricsOpen: boolean;
  isFullPlayerOpen: boolean;
  playbackError: string | null;
  playbackNotice: string | null;
  likedTracks: UnifiedTrack[];

  // Playback actions
  playTrack: (track: UnifiedTrack, newQueue?: UnifiedTrack[]) => void;
  togglePlay: () => void;
  setIsPlaying: (playing: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setPlaybackError: (error: string | null) => void;
  setPlaybackNotice: (notice: string | null) => void;
  playNext: (fromAutoEnd?: boolean) => void;
  playPrev: () => void;

  // Timeline & volume
  setProgress: (seconds: number) => void;
  setDuration: (seconds: number) => void;
  seekTo: (seconds: number) => void;
  clearSeekTarget: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;

  // Modes
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;

  // Queue management
  addToQueue: (track: UnifiedTrack) => void;
  playNextInQueue: (track: UnifiedTrack) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  updateTrackInStore: (updated: UnifiedTrack) => void;

  // UI overlays
  toggleQueueOpen: () => void;
  setQueueOpen: (open: boolean) => void;
  toggleLyricsOpen: () => void;
  setLyricsOpen: (open: boolean) => void;
  setFullPlayerOpen: (open: boolean) => void;

  // Local likes (Phase 3 will sync with Supabase)
  toggleLikeTrack: (track: UnifiedTrack) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      sourceType: null,
      queue: [],
      queueIndex: -1,
      isPlaying: false,
      isLoading: false,
      volume: 80,
      isMuted: false,
      progress: 0,
      duration: 0,
      seekTarget: null,
      repeatMode: "off",
      isShuffle: false,
      isQueueOpen: false,
      isLyricsOpen: false,
      isFullPlayerOpen: false,
      playbackError: null,
      playbackNotice: null,
      likedTracks: [],

      playTrack: (track, newQueue) => {
        const state = get();
        let nextQueue = state.queue;
        let nextIndex = state.queue.findIndex((t) => t.id === track.id);

        if (newQueue && newQueue.length > 0) {
          nextQueue = newQueue;
          nextIndex = newQueue.findIndex((t) => t.id === track.id);
          if (nextIndex === -1) {
            nextQueue = [track, ...newQueue];
            nextIndex = 0;
          }
        } else if (nextIndex === -1) {
          nextQueue = [...state.queue, track];
          nextIndex = nextQueue.length - 1;
        }

        // Clicking the currently active track toggles play/pause
        if (state.currentTrack?.id === track.id) {
          set({
            isPlaying: !state.isPlaying,
            playbackError: null,
          });
          return;
        }

        set({
          currentTrack: track,
          sourceType: track.source,
          queue: nextQueue,
          queueIndex: nextIndex,
          isPlaying: true,
          isLoading: true,
          progress: 0,
          duration: track.duration || 0,
          seekTarget: null,
          playbackError: null,
        });
      },

      togglePlay: () => {
        const { currentTrack, isPlaying } = get();
        if (!currentTrack) return;
        set({ isPlaying: !isPlaying, playbackError: null });
      },

      setIsPlaying: (playing) => set({ isPlaying: playing }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      setPlaybackError: (error) => set({ playbackError: error }),
      setPlaybackNotice: (notice) => set({ playbackNotice: notice }),

      playNext: (fromAutoEnd = false) => {
        const { queue, queueIndex, repeatMode, isShuffle, currentTrack } =
          get();
        if (queue.length === 0 || !currentTrack) return;

        if (fromAutoEnd && repeatMode === "one") {
          set({
            progress: 0,
            seekTarget: 0,
            isPlaying: true,
            playbackError: null,
          });
          return;
        }

        let nextIdx = -1;
        if (isShuffle && queue.length > 1) {
          do {
            nextIdx = Math.floor(Math.random() * queue.length);
          } while (nextIdx === queueIndex);
        } else if (queueIndex + 1 < queue.length) {
          nextIdx = queueIndex + 1;
        } else if (repeatMode === "all") {
          nextIdx = 0;
        }

        if (nextIdx === -1) {
          set({ isPlaying: false, progress: 0 });
          return;
        }

        const nextTrack = queue[nextIdx];
        set({
          currentTrack: nextTrack,
          sourceType: nextTrack.source,
          queueIndex: nextIdx,
          isPlaying: true,
          isLoading: true,
          progress: 0,
          duration: nextTrack.duration || 0,
          seekTarget: null,
          playbackError: null,
        });
      },

      playPrev: () => {
        const { queue, queueIndex, progress, repeatMode, currentTrack } = get();
        if (!currentTrack) return;

        // If > 3 seconds into track, restart current track
        if (progress > 3) {
          set({ progress: 0, seekTarget: 0 });
          return;
        }

        if (queue.length === 0) return;

        let prevIdx = queueIndex - 1;
        if (prevIdx < 0) {
          prevIdx = repeatMode === "all" ? queue.length - 1 : 0;
        }

        const prevTrack = queue[prevIdx];
        set({
          currentTrack: prevTrack,
          sourceType: prevTrack.source,
          queueIndex: prevIdx,
          isPlaying: true,
          isLoading: true,
          progress: 0,
          duration: prevTrack.duration || 0,
          seekTarget: null,
          playbackError: null,
        });
      },

      setProgress: (seconds) => set({ progress: seconds }),
      setDuration: (seconds) => {
        if (Number.isFinite(seconds) && seconds > 0) {
          set({ duration: seconds });
        }
      },
      seekTo: (seconds) => {
        const clamped = Math.max(0, seconds);
        set({ progress: clamped, seekTarget: clamped });
      },
      clearSeekTarget: () => set({ seekTarget: null }),

      setVolume: (volume) => {
        const clamped = Math.max(0, Math.min(100, volume));
        set({ volume: clamped, isMuted: clamped === 0 });
      },
      toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),

      toggleShuffle: () => set((s) => ({ isShuffle: !s.isShuffle })),
      cycleRepeatMode: () =>
        set((s) => ({
          repeatMode:
            s.repeatMode === "off"
              ? "all"
              : s.repeatMode === "all"
              ? "one"
              : "off",
        })),

      addToQueue: (track) =>
        set((s) => {
          if (s.queue.some((t) => t.id === track.id)) return s;
          return { queue: [...s.queue, track] };
        }),

      playNextInQueue: (track) =>
        set((s) => {
          const filtered = s.queue.filter((t) => t.id !== track.id);
          const currentIdx = s.currentTrack
            ? filtered.findIndex((t) => t.id === s.currentTrack?.id)
            : -1;
          const insertAt = currentIdx >= 0 ? currentIdx + 1 : 0;
          const nextQueue = [
            ...filtered.slice(0, insertAt),
            track,
            ...filtered.slice(insertAt),
          ];
          return {
            queue: nextQueue,
            queueIndex: currentIdx >= 0 ? currentIdx : s.queueIndex,
          };
        }),

      removeFromQueue: (index) =>
        set((s) => {
          if (index < 0 || index >= s.queue.length) return s;
          const nextQueue = s.queue.filter((_, i) => i !== index);
          let nextIndex = s.queueIndex;
          if (index < s.queueIndex) {
            nextIndex = s.queueIndex - 1;
          } else if (index === s.queueIndex) {
            nextIndex = Math.min(index, nextQueue.length - 1);
          }
          return { queue: nextQueue, queueIndex: nextIndex };
        }),

      clearQueue: () =>
        set((s) => {
          if (!s.currentTrack) return { queue: [], queueIndex: -1 };
          return { queue: [s.currentTrack], queueIndex: 0 };
        }),

      updateTrackInStore: (updated) =>
        set((s) => ({
          currentTrack:
            s.currentTrack?.id === updated.id ? updated : s.currentTrack,
          queue: s.queue.map((item) =>
            item.id === updated.id ? updated : item
          ),
        })),

      toggleQueueOpen: () =>
        set((s) => ({
          isQueueOpen: !s.isQueueOpen,
          isLyricsOpen: !s.isQueueOpen ? false : s.isLyricsOpen,
        })),
      setQueueOpen: (open) =>
        set((s) => ({
          isQueueOpen: open,
          isLyricsOpen: open ? false : s.isLyricsOpen,
        })),
      toggleLyricsOpen: () =>
        set((s) => ({
          isLyricsOpen: !s.isLyricsOpen,
          isQueueOpen: !s.isLyricsOpen ? false : s.isQueueOpen,
        })),
      setLyricsOpen: (open) =>
        set((s) => ({
          isLyricsOpen: open,
          isQueueOpen: open ? false : s.isQueueOpen,
        })),
      setFullPlayerOpen: (open) => set({ isFullPlayerOpen: open }),

      toggleLikeTrack: (track) =>
        set((s) => {
          const exists = s.likedTracks.some((t) => t.id === track.id);
          return {
            likedTracks: exists
              ? s.likedTracks.filter((t) => t.id !== track.id)
              : [track, ...s.likedTracks],
          };
        }),
    }),
    {
      name: "hnbeemusic-player-prefs",
      partialize: (state) => ({
        volume: state.volume,
        repeatMode: state.repeatMode,
        isShuffle: state.isShuffle,
        likedTracks: state.likedTracks,
      }),
    }
  )
);
