"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { isIOSDevice, registerGlobalAudioElement } from "@/lib/audio/ios-unlock";
import type { EngineHandle } from "./YouTubeAdapter";

export interface Html5EngineHandle extends EngineHandle {
  /**
   * Synchronously swaps `audio.src = nextUrl` and calls `audio.play()` WITHOUT
   * calling `removeAttribute('src')`, keeping iOS's background Audio Session alive
   * across track transitions when the screen is locked.
   */
  switchStreamNow: (nextUrl: string) => void;
}

interface Html5AudioAdapterProps {
  streamUrl: string | null;
  active: boolean;
  isPlaying: boolean;
  volume: number; // 0..100
  onProgress: (seconds: number) => void;
  onDuration: (seconds: number) => void;
  onStateChange: (state: { isPlaying?: boolean; isLoading?: boolean }) => void;
  onPlaying?: () => void;
  onEnded: () => void;
  onError: (message: string) => void;
}

/**
 * Native HTML5 <audio> engine for iOS Background Playback, SoundCloud progressive/HLS streams,
 * and direct proxied audio-only streams.
 *
 * iOS Safari Background Rules Enforced:
 * - Never calls `removeAttribute('src')` when transitioning to a new track (preserves Audio Session).
 * - Recovers from iOS system auto-pause on `visibilitychange` (hidden) when store `isPlaying === true`.
 * - Fires `onPlaying` immediately so `navigator.mediaSession` locks in Control Center & Lock Screen metadata.
 */
export const Html5AudioAdapter = forwardRef<
  Html5EngineHandle,
  Html5AudioAdapterProps
>(function Html5AudioAdapter(
  {
    streamUrl,
    active,
    isPlaying,
    volume,
    onProgress,
    onDuration,
    onStateChange,
    onPlaying,
    onEnded,
    onError,
  },
  ref
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedUrlRef = useRef<string | null>(null);
  const activeRef = useRef(active);
  const isPlayingRef = useRef(isPlaying);
  // Tracks whether pause was explicitly requested by the user/store (not iOS background throttling)
  const manualPauseRef = useRef(false);
  const hiddenResumeAttemptsRef = useRef(0);
  const resumeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  activeRef.current = active;
  isPlayingRef.current = isPlaying;

  const clearResumeTimers = () => {
    for (const t of resumeTimersRef.current) clearTimeout(t);
    resumeTimersRef.current = [];
  };

  const safePlay = (el: HTMLAudioElement) => {
    try {
      manualPauseRef.current = false;
      const promise = el.play();
      if (promise && typeof promise.catch === "function") {
        promise.catch((err: unknown) => {
          if (
            err instanceof DOMException &&
            (err.name === "AbortError" || err.name === "NotAllowedError")
          ) {
            return;
          }
        });
      }
    } catch {}
  };

  // Register this single global <audio> element for iOS Safari Instant Audio Unlock
  useEffect(() => {
    registerGlobalAudioElement(audioRef.current);
    return () => {
      clearResumeTimers();
      registerGlobalAudioElement(null);
    };
  }, []);

  // iOS Background Keep-Alive: recover playback if iOS auto-pauses when swiping to Home Screen / Lock Screen
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      const el = audioRef.current;
      if (!el) return;

      if (document.visibilityState === "visible") {
        hiddenResumeAttemptsRef.current = 0;
        clearResumeTimers();
        return;
      }

      if (
        document.visibilityState === "hidden" &&
        activeRef.current &&
        isPlayingRef.current &&
        !manualPauseRef.current &&
        !el.ended
      ) {
        hiddenResumeAttemptsRef.current = 0;
        clearResumeTimers();
        // Immediate 50ms check + 250ms backup check to counter iOS WebKit auto-pause
        const t1 = setTimeout(() => {
          if (
            activeRef.current &&
            isPlayingRef.current &&
            !manualPauseRef.current &&
            el.paused &&
            !el.ended
          ) {
            void el.play().catch(() => {});
          }
        }, 50);
        const t2 = setTimeout(() => {
          if (
            activeRef.current &&
            isPlayingRef.current &&
            !manualPauseRef.current &&
            el.paused &&
            !el.ended
          ) {
            void el.play().catch(() => {});
          }
        }, 250);
        resumeTimersRef.current.push(t1, t2);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearResumeTimers();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    play: () => {
      const el = audioRef.current;
      if (!el) return;
      manualPauseRef.current = false;
      safePlay(el);
    },
    pause: () => {
      manualPauseRef.current = true;
      clearResumeTimers();
      audioRef.current?.pause();
    },
    switchStreamNow: (nextUrl: string) => {
      const el = audioRef.current;
      if (!el || !nextUrl) return;
      manualPauseRef.current = false;
      loadedUrlRef.current = nextUrl;
      // Directly assign `el.src` without `removeAttribute('src')` to retain iOS background Audio Session!
      el.src = nextUrl;
      safePlay(el);
    },
    stopAndReset: () => {
      const el = audioRef.current;
      if (!el) return;
      manualPauseRef.current = true;
      clearResumeTimers();
      el.pause();
      try {
        el.currentTime = 0;
        // On iOS, avoid removing `src` so the unlocked Audio Session stays valid for the next track
        if (!isIOSDevice()) {
          el.removeAttribute("src");
          el.load();
        }
      } catch {}
      loadedUrlRef.current = null;
    },
    seekTo: (seconds: number) => {
      const el = audioRef.current;
      if (!el) return;
      try {
        el.currentTime = Math.max(0, seconds);
      } catch {}
    },
    setVolume: (vol: number) => {
      const el = audioRef.current;
      if (!el) return;
      el.volume = Math.max(0, Math.min(1, vol / 100));
    },
  }));

  // Sync volume
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, volume / 100));
  }, [volume]);

  // Load new stream URL when active — NEVER call `removeAttribute('src')` between tracks so iOS retains background Audio Session!
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!active || !streamUrl) {
      if (loadedUrlRef.current) {
        el.pause();
        // On iOS, do NOT strip `src` while switching tracks in background — keep Audio Session warm
        if (!isIOSDevice()) {
          try {
            el.removeAttribute("src");
            el.load();
          } catch {}
        }
        loadedUrlRef.current = null;
      }
      return;
    }

    if (loadedUrlRef.current !== streamUrl) {
      loadedUrlRef.current = streamUrl;
      manualPauseRef.current = !isPlayingRef.current;
      // Directly assign new src without removeAttribute('src')
      el.src = streamUrl;
      if (isPlayingRef.current) {
        safePlay(el);
      }
    }
  }, [active, streamUrl]);

  // Sync play / pause from Zustand store
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !active || !streamUrl) return;
    if (isPlaying) {
      manualPauseRef.current = false;
      safePlay(el);
    } else {
      manualPauseRef.current = true;
      clearResumeTimers();
      el.pause();
    }
  }, [active, isPlaying, streamUrl]);

  return (
    <audio
      ref={audioRef}
      preload="auto"
      playsInline
      data-hnbee-audio="true"
      className="pointer-events-none fixed bottom-0 right-0 h-px w-px opacity-[0.01]"
      onLoadStart={() => {
        if (activeRef.current) onStateChange({ isLoading: true });
      }}
      onWaiting={() => {
        if (activeRef.current) onStateChange({ isLoading: true });
      }}
      onCanPlay={() => {
        if (!activeRef.current) return;
        onStateChange({ isLoading: false });
        if (isPlayingRef.current && !manualPauseRef.current) {
          void audioRef.current?.play().catch(() => {});
        }
      }}
      onLoadedMetadata={(e) => {
        if (!activeRef.current) return;
        const dur = e.currentTarget.duration;
        if (Number.isFinite(dur) && dur > 0) onDuration(dur);
      }}
      onDurationChange={(e) => {
        if (!activeRef.current) return;
        const dur = e.currentTarget.duration;
        if (Number.isFinite(dur) && dur > 0) onDuration(dur);
      }}
      onTimeUpdate={(e) => {
        if (!activeRef.current) return;
        onProgress(e.currentTarget.currentTime);
      }}
      onPlay={() => {
        if (activeRef.current) {
          manualPauseRef.current = false;
          onStateChange({ isPlaying: true, isLoading: false });
        }
      }}
      onPlaying={() => {
        if (!activeRef.current) return;
        manualPauseRef.current = false;
        hiddenResumeAttemptsRef.current = 0;
        onStateChange({ isPlaying: true, isLoading: false });
        onPlaying?.();
      }}
      onPause={() => {
        if (!activeRef.current) return;
        const el = audioRef.current;
        // If iOS paused the <audio> element automatically when swiping to Home Screen / locking screen,
        // keep `isPlaying === true` in store and immediately resume playback in 50ms!
        if (
          typeof document !== "undefined" &&
          document.visibilityState === "hidden" &&
          isPlayingRef.current &&
          !manualPauseRef.current &&
          el &&
          !el.ended &&
          hiddenResumeAttemptsRef.current < 3
        ) {
          hiddenResumeAttemptsRef.current += 1;
          const timer = setTimeout(() => {
            if (
              activeRef.current &&
              isPlayingRef.current &&
              !manualPauseRef.current &&
              el.paused &&
              !el.ended
            ) {
              void el.play().catch(() => {});
            }
          }, 50);
          resumeTimersRef.current.push(timer);
          return;
        }
        onStateChange({ isPlaying: false });
      }}
      onEnded={() => {
        if (activeRef.current) onEnded();
      }}
      onError={() => {
        if (!activeRef.current) return;
        onStateChange({ isLoading: false });
        onError("HTML5_STREAM_FAILED");
      }}
    />
  );
});
