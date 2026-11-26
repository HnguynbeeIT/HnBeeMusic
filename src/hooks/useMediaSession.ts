"use client";

import { useEffect, useRef } from "react";
import type { UnifiedTrack } from "@/lib/audio/types";
import { usePlaybackTimeStore } from "@/store/usePlaybackTimeStore";

interface MediaSessionHandlers {
  onPlay: () => void;
  onPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeekTo: (seconds: number) => void;
}

interface UseMediaSessionParams extends MediaSessionHandlers {
  currentTrack: UnifiedTrack | null;
  isPlaying: boolean;
}

const ARTWORK_SIZES = [
  "512x512",
  "384x384",
  "256x256",
  "192x192",
  "128x128",
  "96x96",
];

function safeSetActionHandler(
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null
): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {}
}

/**
 * Synchronously pushes metadata (including 512x512 artwork), playbackState = 'playing',
 * and Control Center / Lock Screen action handlers directly inside the native `<audio>` `playing` event
 * so iOS recognizes HnBee Music as an active background audio session immediately.
 */
export function syncMediaSessionOnPlaying(
  track: UnifiedTrack | null,
  handlers: MediaSessionHandlers
): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return;
  }

  if (track && typeof MediaMetadata !== "undefined") {
    const artworkSrc = track.thumbnail || "/icon.png";
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || "HnBee Music",
        artist: track.artist || "Unknown Artist",
        album: "HnBee Music",
        artwork: ARTWORK_SIZES.map((sizes) => ({
          src: artworkSrc,
          sizes,
          type: artworkSrc.endsWith(".png") ? "image/png" : "image/jpeg",
        })),
      });
    } catch {}
  }

  try {
    navigator.mediaSession.playbackState = "playing";
  } catch {}

  safeSetActionHandler("play", handlers.onPlay);
  safeSetActionHandler("pause", handlers.onPause);
  safeSetActionHandler("previoustrack", handlers.onPrev);
  safeSetActionHandler("nexttrack", handlers.onNext);
  safeSetActionHandler("seekto", (details) => {
    if (
      typeof details.seekTime === "number" &&
      Number.isFinite(details.seekTime)
    ) {
      handlers.onSeekTo(Math.max(0, details.seekTime));
    }
  });
}

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

    safeSetActionHandler("play", onPlay);
    safeSetActionHandler("pause", onPause);
    safeSetActionHandler("previoustrack", onPrev);
    safeSetActionHandler("nexttrack", onNext);
    safeSetActionHandler("seekto", (details) => {
      if (
        typeof details.seekTime === "number" &&
        Number.isFinite(details.seekTime)
      ) {
        onSeekTo(Math.max(0, details.seekTime));
      }
    });
    safeSetActionHandler("seekbackward", (details) => {
      const offset = details.seekOffset || 10;
      const currentPos = usePlaybackTimeStore.getState().progress;
      onSeekTo(Math.max(0, currentPos - offset));
    });
    safeSetActionHandler("seekforward", (details) => {
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
        safeSetActionHandler(action, null);
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
