"use client";

import { useEffect } from "react";
import type { UnifiedTrack } from "@/lib/audio/types";

interface UseMediaSessionParams {
  currentTrack: UnifiedTrack | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeekTo: (seconds: number) => void;
}

const ARTWORK_SIZES = ["96x96", "128x128", "192x192", "256x256", "384x384", "512x512"];

/**
 * SSR-safe Media Session API integration for:
 * - iOS Lock Screen & Dynamic Island
 * - Android Notification Media Controls
 * - Windows / macOS Hardware Media Keys & Media Widget
 */
export function useMediaSession({
  currentTrack,
  isPlaying,
  progress,
  duration,
  onPlay,
  onPause,
  onPrev,
  onNext,
  onSeekTo,
}: UseMediaSessionParams) {
  // 1. Sync metadata + action handlers on track / handler changes
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
      if (typeof details.seekTime === "number" && Number.isFinite(details.seekTime)) {
        onSeekTo(Math.max(0, details.seekTime));
      }
    });
    safeSetHandler("seekbackward", (details) => {
      const offset = details.seekOffset || 10;
      onSeekTo(Math.max(0, progress - offset));
    });
    safeSetHandler("seekforward", (details) => {
      const offset = details.seekOffset || 10;
      const target = duration > 0 ? Math.min(duration, progress + offset) : progress + offset;
      onSeekTo(target);
    });
  }, [currentTrack, duration, onNext, onPause, onPlay, onPrev, onSeekTo, progress]);

  // 2. Sync playbackState & live Lock Screen position scrubber
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

    if (
      currentTrack &&
      typeof navigator.mediaSession.setPositionState === "function" &&
      Number.isFinite(duration) &&
      duration > 0 &&
      Number.isFinite(progress)
    ) {
      try {
        const clampedPos = Math.min(Math.max(0, progress), duration);
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: clampedPos,
        });
      } catch {}
    }
  }, [currentTrack, isPlaying, progress, duration]);
}
