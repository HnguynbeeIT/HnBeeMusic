"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { registerGlobalAudioElement } from "@/lib/audio/ios-unlock";
import type { EngineHandle } from "./YouTubeAdapter";

interface Html5AudioAdapterProps {
  streamUrl: string | null;
  active: boolean;
  isPlaying: boolean;
  volume: number; // 0..100
  onProgress: (seconds: number) => void;
  onDuration: (seconds: number) => void;
  onStateChange: (state: { isPlaying?: boolean; isLoading?: boolean }) => void;
  onEnded: () => void;
  onError: (message: string) => void;
}

/**
 * Native HTML5 <audio> engine for SoundCloud progressive MP3 & direct audio streams.
 * Syncs timeupdate, duration, buffering, and ended events directly into Zustand.
 */
export const Html5AudioAdapter = forwardRef<
  EngineHandle,
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
    onEnded,
    onError,
  },
  ref
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedUrlRef = useRef<string | null>(null);
  const activeRef = useRef(active);
  const isPlayingRef = useRef(isPlaying);
  activeRef.current = active;
  isPlayingRef.current = isPlaying;

  // Register this single global <audio> element for iOS Safari Instant Audio Unlock
  useEffect(() => {
    registerGlobalAudioElement(audioRef.current);
    return () => registerGlobalAudioElement(null);
  }, []);

    const safePlay = (el: HTMLAudioElement) => {
      try {
        const promise = el.play();
        if (promise && typeof promise.catch === "function") {
          promise.catch((err: unknown) => {
            // Ignore expected AbortError during rapid track switching or NotAllowedError before gesture
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

    useImperativeHandle(ref, () => ({
      play: () => {
        const el = audioRef.current;
        if (!el) return;
        safePlay(el);
      },
    pause: () => {
      audioRef.current?.pause();
    },
    stopAndReset: () => {
      const el = audioRef.current;
      if (!el) return;
      el.pause();
      try {
        el.currentTime = 0;
        el.removeAttribute("src");
        el.load();
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

  // Load new stream URL when active (strict iOS Safari reset before assigning new src)
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!active || !streamUrl) {
      if (loadedUrlRef.current) {
        el.pause();
        try {
          el.removeAttribute("src");
          el.load();
        } catch {}
        loadedUrlRef.current = null;
      }
      return;
    }
    if (loadedUrlRef.current !== streamUrl) {
      loadedUrlRef.current = streamUrl;
      el.pause();
      try {
        el.removeAttribute("src");
        el.load();
      } catch {}
      el.src = streamUrl;
      el.load();
      if (isPlayingRef.current) {
        safePlay(el);
      }
    }
  }, [active, streamUrl]);

  // Sync play / pause
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !active || !streamUrl) return;
    if (isPlaying) {
      safePlay(el);
    } else {
      el.pause();
    }
  }, [active, isPlaying, streamUrl]);

  return (
    <audio
      ref={audioRef}
      preload="auto"
      playsInline
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
        if (isPlayingRef.current) {
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
          onStateChange({ isPlaying: true, isLoading: false });
        }
      }}
      onPause={() => {
        if (activeRef.current) {
          onStateChange({ isPlaying: false });
        }
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
