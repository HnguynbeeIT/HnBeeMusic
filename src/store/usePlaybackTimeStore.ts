"use client";

import { create } from "zustand";

interface PlaybackTimeState {
  progress: number;
  duration: number;
  setProgress: (seconds: number) => void;
  setDuration: (seconds: number) => void;
  resetTime: (duration?: number) => void;
}

/**
 * Isolated high-frequency playback timeline store (updates ~4x/sec).
 * Keeping `progress` out of `usePlayerStore` prevents re-rendering BottomPlayerBar,
 * AudioEngineManager, and closed modals every 250ms.
 */
export const usePlaybackTimeStore = create<PlaybackTimeState>()((set) => ({
  progress: 0,
  duration: 0,

  setProgress: (seconds) => {
    if (Number.isFinite(seconds) && seconds >= 0) {
      set({ progress: seconds });
    }
  },

  setDuration: (seconds) => {
    if (Number.isFinite(seconds) && seconds > 0) {
      set({ duration: seconds });
    }
  },

  resetTime: (duration = 0) =>
    set({
      progress: 0,
      duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    }),
}));
