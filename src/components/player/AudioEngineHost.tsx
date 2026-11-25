"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { getByokHeaders } from "@/store/useSettingsStore";
import { extractYouTubeId } from "@/lib/audio/url-parser";
import { YouTubeAdapter, type EngineHandle } from "./YouTubeAdapter";
import { SoundCloudAdapter } from "./SoundCloudAdapter";

type ActiveEngine = "youtube" | "soundcloud" | null;

/**
 * Mounted ONCE in RootLayout (src/app/layout.tsx).
 * Enforces player-controller & spotify-matcher skills:
 * - Single Active Engine: pauses & resets previous engine to currentTime = 0 before switching
 * - Lazy Stream Matching for Spotify tracks (plus prefetching the next queued Spotify track)
 * - Full Zustand state sync + Auto-Next + Media Session API
 */
export function AudioEngineHost() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const seekTarget = usePlayerStore((s) => s.seekTarget);

  const setProgress = usePlayerStore((s) => s.setProgress);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
  const setIsLoading = usePlayerStore((s) => s.setIsLoading);
  const setPlaybackError = usePlayerStore((s) => s.setPlaybackError);
  const clearSeekTarget = usePlayerStore((s) => s.clearSeekTarget);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrev = usePlayerStore((s) => s.playPrev);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const updateTrackInStore = usePlayerStore((s) => s.updateTrackInStore);

  const ytRef = useRef<EngineHandle | null>(null);
  const scRef = useRef<EngineHandle | null>(null);
  const prevEngineRef = useRef<ActiveEngine>(null);
  const matchingIdsRef = useRef<Set<string>>(new Set());

  const effectiveVolume = isMuted ? 0 : volume;

  // Determine active playback engine & resolved media target
  const { activeEngine, youtubeVideoId, soundCloudUrl } = useMemo(() => {
    if (!currentTrack) {
      return {
        activeEngine: null as ActiveEngine,
        youtubeVideoId: null as string | null,
        soundCloudUrl: null as string | null,
      };
    }

    if (currentTrack.source === "youtube") {
      return {
        activeEngine: "youtube" as ActiveEngine,
        youtubeVideoId: extractYouTubeId(currentTrack.sourceUrl),
        soundCloudUrl: null,
      };
    }

    if (currentTrack.source === "soundcloud") {
      return {
        activeEngine: "soundcloud" as ActiveEngine,
        youtubeVideoId: null,
        soundCloudUrl: currentTrack.sourceUrl,
      };
    }

    // Spotify track -> route to lazily matched YouTube or SoundCloud stream
    if (currentTrack.resolvedSource === "youtube" && currentTrack.streamUrl) {
      return {
        activeEngine: "youtube" as ActiveEngine,
        youtubeVideoId: extractYouTubeId(currentTrack.streamUrl),
        soundCloudUrl: null,
      };
    }

    if (
      currentTrack.resolvedSource === "soundcloud" &&
      currentTrack.streamUrl
    ) {
      return {
        activeEngine: "soundcloud" as ActiveEngine,
        youtubeVideoId: null,
        soundCloudUrl: currentTrack.streamUrl,
      };
    }

    return {
      activeEngine: null as ActiveEngine,
      youtubeVideoId: null,
      soundCloudUrl: null,
    };
  }, [currentTrack]);

  // SINGLE ACTIVE ENGINE: pause & reset currentTime = 0 on previous engine before switching
  useEffect(() => {
    const prev = prevEngineRef.current;
    if (prev && prev !== activeEngine) {
      if (prev === "youtube") {
        ytRef.current?.stopAndReset();
      } else if (prev === "soundcloud") {
        scRef.current?.stopAndReset();
      }
    }
    prevEngineRef.current = activeEngine;
  }, [activeEngine]);

  // LAZY STREAM MATCHING for Spotify current track
  useEffect(() => {
    if (
      !currentTrack ||
      currentTrack.source !== "spotify" ||
      (currentTrack.streamUrl && currentTrack.resolvedSource)
    ) {
      return;
    }

    if (matchingIdsRef.current.has(currentTrack.id)) return;
    matchingIdsRef.current.add(currentTrack.id);
    setIsLoading(true);

    fetch("/api/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getByokHeaders(),
      },
      body: JSON.stringify({ matchTrack: currentTrack }),
    })
      .then((res) => res.json())
      .then((data: { track?: typeof currentTrack }) => {
        if (data.track?.streamUrl && data.track?.resolvedSource) {
          updateTrackInStore(data.track);
        } else {
          setIsLoading(false);
          setIsPlaying(false);
          setPlaybackError(
            "Chưa tìm thấy luồng phát cho bài Spotify này. Hãy cấu hình YOUTUBE_API_KEY trong .env.local để tự động map audio."
          );
        }
      })
      .catch(() => {
        setIsLoading(false);
        setIsPlaying(false);
        setPlaybackError("Lỗi kết nối khi tìm luồng phát cho bài Spotify.");
      })
      .finally(() => {
        matchingIdsRef.current.delete(currentTrack.id);
      });
  }, [
    currentTrack,
    setIsLoading,
    setIsPlaying,
    setPlaybackError,
    updateTrackInStore,
  ]);

  // LAZY PREFETCH: prefetch only the immediate next track if it's an unmatched Spotify track
  useEffect(() => {
    const nextTrack = queue[queueIndex + 1];
    if (
      !nextTrack ||
      nextTrack.source !== "spotify" ||
      (nextTrack.streamUrl && nextTrack.resolvedSource) ||
      matchingIdsRef.current.has(nextTrack.id)
    ) {
      return;
    }

    matchingIdsRef.current.add(nextTrack.id);
    fetch("/api/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getByokHeaders(),
      },
      body: JSON.stringify({ matchTrack: nextTrack }),
    })
      .then((res) => res.json())
      .then((data: { track?: typeof nextTrack }) => {
        if (data.track?.streamUrl && data.track?.resolvedSource) {
          updateTrackInStore(data.track);
        }
      })
      .catch(() => {})
      .finally(() => {
        matchingIdsRef.current.delete(nextTrack.id);
      });
  }, [queue, queueIndex, updateTrackInStore]);

  // Handle seek requests from BottomPlayerBar / FullScreenModal / MediaSession
  useEffect(() => {
    if (seekTarget === null) return;
    if (activeEngine === "youtube") {
      ytRef.current?.seekTo(seekTarget);
    } else if (activeEngine === "soundcloud") {
      scRef.current?.seekTo(seekTarget);
    }
    clearSeekTarget();
  }, [seekTarget, activeEngine, clearSeekTarget]);

  // MEDIA SESSION API synchronization
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    if (currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: `HnBeeMusic · ${currentTrack.source.toUpperCase()}`,
        artwork: currentTrack.thumbnail
          ? [
              {
                src: currentTrack.thumbnail,
                sizes: "512x512",
                type: "image/jpeg",
              },
            ]
          : [],
      });
    }

    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

    try {
      navigator.mediaSession.setActionHandler("play", () => setIsPlaying(true));
      navigator.mediaSession.setActionHandler("pause", () =>
        setIsPlaying(false)
      );
      navigator.mediaSession.setActionHandler("previoustrack", () =>
        playPrev()
      );
      navigator.mediaSession.setActionHandler("nexttrack", () =>
        playNext(false)
      );
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (typeof details.seekTime === "number") {
          seekTo(details.seekTime);
        }
      });
    } catch {
      // Some browsers don't support all Media Session actions
    }
  }, [currentTrack, isPlaying, playNext, playPrev, seekTo, setIsPlaying]);

  const handleStateChange = useCallback(
    (state: { isPlaying?: boolean; isLoading?: boolean }) => {
      if (typeof state.isPlaying === "boolean") setIsPlaying(state.isPlaying);
      if (typeof state.isLoading === "boolean") setIsLoading(state.isLoading);
    },
    [setIsLoading, setIsPlaying]
  );

  const handleEnded = useCallback(() => {
    playNext(true);
  }, [playNext]);

  const handleError = useCallback(
    (msg: string) => {
      setPlaybackError(msg);
    },
    [setPlaybackError]
  );

  return (
    <>
      <YouTubeAdapter
        ref={ytRef}
        videoId={youtubeVideoId}
        active={activeEngine === "youtube"}
        isPlaying={activeEngine === "youtube" && isPlaying}
        volume={effectiveVolume}
        onProgress={setProgress}
        onDuration={setDuration}
        onStateChange={handleStateChange}
        onEnded={handleEnded}
        onError={handleError}
      />
      <SoundCloudAdapter
        ref={scRef}
        trackUrl={soundCloudUrl}
        active={activeEngine === "soundcloud"}
        isPlaying={activeEngine === "soundcloud" && isPlaying}
        volume={effectiveVolume}
        onProgress={setProgress}
        onDuration={setDuration}
        onStateChange={handleStateChange}
        onEnded={handleEnded}
        onError={handleError}
      />
    </>
  );
}
