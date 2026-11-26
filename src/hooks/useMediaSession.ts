"use client";

import { useEffect, useRef } from "react";
import type { UnifiedTrack } from "@/lib/audio/types";
import { usePlaybackTimeStore } from "@/store/usePlaybackTimeStore";

interface UseMediaSessionParams {
  currentTrack: UnifiedTrack | null;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeekTo: (seconds: number) => void;
}

const ARTWORK_SIZES = [
  "96x96",
  "128x128",
  "192x192",
  "256x256",
  "384x384",
  "512x512",
];

/**
 * SSR-safe Media Session API integration for iOS Lock Screen, Dynamic Island,
 * Android Notification Controls, and Desktop Media Keys.
 * Reads timeline via store subscription (throttled ~1s) so AudioEngineManager never re-renders on progress ticks.
 */
export function useMediaSession({
  currentTrack,
  isPlaying,
  onPlay,
  onPause,
  onPrev,
  onNext,
  onSeekTo,
}: UseMediaSessionParams) {
  const lastPositionPushRef = useRef<number>(0);

  // 1. Metadata & Action Handlers (only runs when track or callbacks change — NEVER every 250ms)
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    if (currentTrack && typeof MediaMetadata !== "undefined") {
      const artworkSrc = currentTrack.thumbnail || "/icon.png";
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title || "HnBee Music",
          artist: currentTrack.artist || "Unknown Artist",
          album: "HnBee Music",
          artwork: ARTWORK_SIZES.map((sizes) => ({
            src: artworkSrc,
            sizes,
            type: artworkSrc.endsWith(".png") ? "image/png" : "image/jpeg",
          })),
        });
      } catch {}
    }

    const safeSetHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {}
    };

    safeSetHandler("play", onPlay);
    safeSetHandler("pause", onPause);
    safeSetHandler("previoustrack", onPrev);
    safeSetHandler("nexttrack", onNext);
    safeSetHandler("seekto", (details) => {
      if (
        typeof details.seekTime === "number" &&
        Number.isFinite(details.seekTime)
      ) {
        onSeekTo(Math.max(0, details.seekTime));
      }
    });
    safeSetHandler("seekbackward", (details) => {
      const offset = details.seekOffset || 10;
      const currentPos = usePlaybackTimeStore.getState().progress;
      onSeekTo(Math.max(0, currentPos - offset));
    });
    safeSetHandler("seekforward", (details) => {
      const offset = details.seekOffset || 10;
      const { progress, duration } = usePlaybackTimeStore.getState();
      const target =
        duration > 0
          ? Math.min(duration, progress + offset)
          : progress + offset;
      onSeekTo(target);
    });

    return () => {
      const actions: MediaSessionAction[] = [
        "play",
        "pause",
        "previoustrack",
        "nexttrack",
        "seekto",
        "seekbackward",
        "seekforward",
      ];
      for (const action of actions) {
        safeSetHandler(action, null);
      }
    };
  }, [currentTrack, onNext, onPause, onPlay, onPrev, onSeekTo]);

  // 2. PlaybackState sync
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    try {
      navigator.mediaSession.playbackState = currentTrack
        ? isPlaying
          ? "playing"
          : "paused"
        : "none";
    } catch {}
  }, [currentTrack, isPlaying]);

  // 3. Throttled setPositionState (~1s) via non-rendering Zustand subscription
  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !("mediaSession" in navigator) ||
      typeof navigator.mediaSession.setPositionState !== "function" ||
      !currentTrack
    ) {
      return;
    }

    const pushPosition = (progress: number, duration: number, force = false) => {
      const now = Date.now();
      if (!force && now - lastPositionPushRef.current < 1000) return;
      if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(progress)) {
        return;
      }
      lastPositionPushRef.current = now;
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.min(Math.max(0, progress), duration),
        });
      } catch {}
    };

    const initial = usePlaybackTimeStore.getState();
    pushPosition(initial.progress, initial.duration, true);

    const unsubscribe = usePlaybackTimeStore.subscribe((state) => {
      pushPosition(state.progress, state.duration, false);
    });

    return () => {
      unsubscribe();
    };
  }, [currentTrack]);
}
