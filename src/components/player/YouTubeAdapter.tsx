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
}

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
    },
    ref
  ) {
    const playerRef = useRef<YouTubePlayer | null>(null);
    const loadedIdRef = useRef<string | null>(null);
    const isPlayingRef = useRef(isPlaying);
    const volumeRef = useRef(volume);
    isPlayingRef.current = isPlaying;
    volumeRef.current = volume;

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
        onEnded();
      } else if (ytState === 1) {
        const dur = event.target.getDuration?.() ?? 0;
        if (dur > 0) onDuration(dur);
        onStateChange({ isPlaying: true, isLoading: false });
      } else if (ytState === 2) {
        onStateChange({ isPlaying: false, isLoading: false });
      } else if (ytState === 3) {
        onStateChange({ isLoading: true });
      }
    };

    const handleError = (event: YouTubeEvent<number>) => {
      if (!active) return;
      onStateChange({ isPlaying: false, isLoading: false });
      const code = event.data;
      if (code === 101 || code === 150) {
        onError("Video YouTube này không cho phép phát nhúng (embed).");
      } else {
        onError("Không thể phát nguồn YouTube này.");
      }
    };

    const opts: YouTubeProps["opts"] = {
      height: "1",
      width: "1",
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
      },
    };

    if (!videoId) return null;

    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -left-[9999px] -top-[9999px] h-px w-px overflow-hidden opacity-0"
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
