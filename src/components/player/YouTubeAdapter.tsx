"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import YouTube, {
  type YouTubeEvent,
  type YouTubePlayer,
  type YouTubeProps,
} from "react-youtube";

export interface EngineHandle {
  play: () => void;
  pause: () => void;
  stopAndReset: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
}

interface YouTubeAdapterProps {
  videoId: string | null;
  active: boolean;
  isPlaying: boolean;
  volume: number;
  onReady?: (duration: number) => void;
  onProgress: (seconds: number) => void;
  onDuration: (seconds: number) => void;
  onStateChange: (state: { isPlaying?: boolean; isLoading?: boolean }) => void;
  onEnded: () => void;
  onError: (message: string) => void;
  onFallbackRequest?: (reason: "embed_blocked" | "stall_timeout") => void;
}

const PRE_ROLL_STALL_TIMEOUT_MS = 4000;

export const YouTubeAdapter = forwardRef<EngineHandle, YouTubeAdapterProps>(
  function YouTubeAdapter(
    {
      videoId,
      active,
      isPlaying,
      volume,
      onReady,
      onProgress,
      onDuration,
      onStateChange,
      onEnded,
      onError,
      onFallbackRequest,
    },
    ref
  ) {
    const playerRef = useRef<YouTubePlayer | null>(null);
    const loadedIdRef = useRef<string | null>(null);
    const isPlayingRef = useRef(isPlaying);
    const volumeRef = useRef(volume);
    const hasStartedRef = useRef(false);
    const stallTriggeredForRef = useRef<string | null>(null);
    const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    isPlayingRef.current = isPlaying;
    volumeRef.current = volume;

    const clearStallTimer = () => {
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    };

    const armStallTimer = (targetVideoId: string) => {
      clearStallTimer();
      if (
        !onFallbackRequest ||
        hasStartedRef.current ||
        stallTriggeredForRef.current === targetVideoId
      ) {
        return;
      }
      stallTimerRef.current = setTimeout(() => {
        if (
          !hasStartedRef.current &&
          isPlayingRef.current &&
          stallTriggeredForRef.current !== targetVideoId
        ) {
          stallTriggeredForRef.current = targetVideoId;
          onFallbackRequest("stall_timeout");
        }
      }, PRE_ROLL_STALL_TIMEOUT_MS);
    };

    // Reset stall tracking on videoId / active change
    useEffect(() => {
      hasStartedRef.current = false;
      clearStallTimer();
      if (active && isPlaying && videoId) {
        armStallTimer(videoId);
      }
      return clearStallTimer;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, videoId]);

    useImperativeHandle(ref, () => ({
      play: () => {
        try {
          playerRef.current?.playVideo();
        } catch {}
      },
      pause: () => {
        try {
          playerRef.current?.pauseVideo();
        } catch {}
      },
      stopAndReset: () => {
        try {
          playerRef.current?.pauseVideo();
          playerRef.current?.seekTo(0, true);
        } catch {}
      },
      seekTo: (seconds: number) => {
        try {
          playerRef.current?.seekTo(seconds, true);
        } catch {}
      },
      setVolume: (vol: number) => {
        try {
          playerRef.current?.setVolume(Math.round(vol));
        } catch {}
      },
    }));

    // Load new video when videoId changes while active
    useEffect(() => {
      if (!active || !videoId || !playerRef.current) return;
      if (loadedIdRef.current !== videoId) {
        loadedIdRef.current = videoId;
        try {
          playerRef.current.setVolume(Math.round(volumeRef.current));
          if (isPlayingRef.current) {
            playerRef.current.loadVideoById(videoId);
          } else {
            playerRef.current.cueVideoById(videoId);
          }
        } catch {}
      }
    }, [active, videoId]);

    // Sync play/pause
    useEffect(() => {
      if (!active || !videoId || !playerRef.current) return;
      try {
        if (isPlaying) {
          playerRef.current.playVideo();
        } else {
          playerRef.current.pauseVideo();
        }
      } catch {}
    }, [active, isPlaying, videoId]);

    // Sync volume
    useEffect(() => {
      if (!playerRef.current) return;
      try {
        playerRef.current.setVolume(Math.round(volume));
      } catch {}
    }, [volume]);

    // Poll progress every 250ms while playing
    useEffect(() => {
      if (!active || !isPlaying) return;
      const timer = setInterval(() => {
        try {
          const current = playerRef.current?.getCurrentTime();
          const dur = playerRef.current?.getDuration();
          if (typeof current === "number" && Number.isFinite(current)) {
            onProgress(current);
          }
          if (typeof dur === "number" && Number.isFinite(dur) && dur > 0) {
            onDuration(dur);
          }
        } catch {}
      }, 250);
      return () => clearInterval(timer);
    }, [active, isPlaying, onProgress, onDuration]);

    const handleReady = (event: YouTubeEvent) => {
      playerRef.current = event.target;
      event.target.setVolume(Math.round(volumeRef.current));
      const dur = event.target.getDuration?.() ?? 0;
      if (dur > 0) onDuration(dur);
      onReady?.(dur);

      if (active && videoId) {
        loadedIdRef.current = videoId;
        if (isPlayingRef.current) {
          event.target.playVideo();
        }
      }
    };

    const handleStateChange = (event: YouTubeEvent<number>) => {
      if (!active) return;
      const ytState = event.data;
      // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
      if (ytState === 0) {
        clearStallTimer();
        onEnded();
      } else if (ytState === 1) {
        hasStartedRef.current = true;
        clearStallTimer();
        const dur = event.target.getDuration?.() ?? 0;
        if (dur > 0) onDuration(dur);
        onStateChange({ isPlaying: true, isLoading: false });
      } else if (ytState === 2) {
        clearStallTimer();
        onStateChange({ isPlaying: false, isLoading: false });
      } else if (ytState === 3 || ytState === -1) {
        onStateChange({ isLoading: true });
        if (videoId && isPlayingRef.current && !hasStartedRef.current) {
          armStallTimer(videoId);
        }
      }
    };

    const handleError = (event: YouTubeEvent<number>) => {
      if (!active) return;
      clearStallTimer();
      const code = event.data;
      if ((code === 101 || code === 150) && onFallbackRequest) {
        // Trigger Clean Audio Stream Fallback (Piped/Invidious/SoundCloud)
        onStateChange({ isLoading: true });
        onFallbackRequest("embed_blocked");
        return;
      }
      onStateChange({ isPlaying: false, isLoading: false });
      if (code === 101 || code === 150) {
        onError("Video YouTube này không cho phép phát nhúng (embed).");
      } else {
        onError("Không thể phát nguồn YouTube này.");
      }
    };

    const opts: YouTubeProps["opts"] = {
      host: "https://www.youtube-nocookie.com",
      height: "1",
      width: "1",
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
        ...(typeof window !== "undefined"
          ? { origin: window.location.origin }
          : {}),
      },
    };

    if (!videoId) return null;

    // Keep iframe in-viewport (1px x 1px, opacity 0.01) — NEVER display:none or off-screen,
    // otherwise iOS Safari & Chrome throttle/block media playback!
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 right-0 z-0 h-px w-px overflow-hidden opacity-[0.01]"
      >
        <YouTube
          videoId={videoId}
          opts={opts}
          onReady={handleReady}
          onStateChange={handleStateChange}
          onError={handleError}
        />
      </div>
    );
  }
);
