"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { getByokHeaders } from "@/store/useSettingsStore";
import { extractYouTubeId } from "@/lib/audio/url-parser";
import { YouTubeAdapter, type EngineHandle } from "./YouTubeAdapter";
import { Html5AudioAdapter } from "./Html5AudioAdapter";
import { SoundCloudAdapter } from "./SoundCloudAdapter";

type ActiveEngine = "youtube" | "html5" | "soundcloud-widget" | null;

function isDirectAudioUrl(url?: string): boolean {
  if (!url) return false;
  return (
    /\.(mp3|m4a|ogg|wav|aac|flac)(\?.*)?$/i.test(url) ||
    /cf-media\.sndcdn\.com|media\.soundcloud\.com|audio\.sndcdn\.com/i.test(url)
  );
}

/**
 * Unified Audio Engine Manager mounted ONCE in RootLayout (src/app/layout.tsx).
 * - YouTube Engine: hidden react-youtube (IFrame API)
 * - HTML5 Audio Engine: native <audio> for SoundCloud progressive MP3 & direct streams
 * - SoundCloud Widget Fallback: guarantees playback even if SoundCloud returns HLS-only
 * - Single Active Engine: immediately pauses & resets (currentTime = 0) all inactive engines
 * - Media Session API: keyboard media keys & mobile lock-screen controls
 */
export function AudioEngineManager() {
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
  const html5Ref = useRef<EngineHandle | null>(null);
  const scWidgetRef = useRef<EngineHandle | null>(null);
  const prevEngineRef = useRef<ActiveEngine>(null);
  const matchingIdsRef = useRef<Set<string>>(new Set());

  // Track IDs that fell back to SoundCloud Widget after HTML5 stream extraction failed
  const [scWidgetFallbackIds, setScWidgetFallbackIds] = useState<Set<string>>(
    () => new Set()
  );
  const [scResolvingId, setScResolvingId] = useState<string | null>(null);

  const effectiveVolume = isMuted ? 0 : volume;

  // Determine active playback engine & resolved media target
  const { activeEngine, youtubeVideoId, html5StreamUrl, soundCloudWidgetUrl } =
    useMemo(() => {
      if (!currentTrack) {
        return {
          activeEngine: null as ActiveEngine,
          youtubeVideoId: null as string | null,
          html5StreamUrl: null as string | null,
          soundCloudWidgetUrl: null as string | null,
        };
      }

      // 1. Direct HTML5 audio stream (SoundCloud extracted MP3 or direct audio URL)
      if (
        isDirectAudioUrl(currentTrack.streamUrl) &&
        !scWidgetFallbackIds.has(currentTrack.id)
      ) {
        return {
          activeEngine: "html5" as ActiveEngine,
          youtubeVideoId: null,
          html5StreamUrl: currentTrack.streamUrl!,
          soundCloudWidgetUrl: null,
        };
      }

      // 2. YouTube native track
      if (currentTrack.source === "youtube") {
        return {
          activeEngine: "youtube" as ActiveEngine,
          youtubeVideoId: extractYouTubeId(currentTrack.sourceUrl),
          html5StreamUrl: null,
          soundCloudWidgetUrl: null,
        };
      }

      // 3. SoundCloud track (waits for progressive MP3 extraction, else falls back to Widget)
      if (currentTrack.source === "soundcloud") {
        if (scWidgetFallbackIds.has(currentTrack.id)) {
          return {
            activeEngine: "soundcloud-widget" as ActiveEngine,
            youtubeVideoId: null,
            html5StreamUrl: null,
            soundCloudWidgetUrl: currentTrack.sourceUrl,
          };
        }
        return {
          activeEngine: null as ActiveEngine,
          youtubeVideoId: null,
          html5StreamUrl: null,
          soundCloudWidgetUrl: null,
        };
      }

      // 4. Spotify track -> route to lazily matched YouTube or SoundCloud stream
      if (currentTrack.resolvedSource === "youtube" && currentTrack.streamUrl) {
        return {
          activeEngine: "youtube" as ActiveEngine,
          youtubeVideoId: extractYouTubeId(currentTrack.streamUrl),
          html5StreamUrl: null,
          soundCloudWidgetUrl: null,
        };
      }

      if (
        currentTrack.resolvedSource === "soundcloud" &&
        currentTrack.streamUrl
      ) {
        return {
          activeEngine: "soundcloud-widget" as ActiveEngine,
          youtubeVideoId: null,
          html5StreamUrl: null,
          soundCloudWidgetUrl: currentTrack.streamUrl,
        };
      }

      return {
        activeEngine: null as ActiveEngine,
        youtubeVideoId: null,
        html5StreamUrl: null,
        soundCloudWidgetUrl: null,
      };
    }, [currentTrack, scWidgetFallbackIds]);

  // SINGLE ACTIVE ENGINE: pause & reset currentTime = 0 on previous engine immediately
  useEffect(() => {
    const prev = prevEngineRef.current;
    if (prev && prev !== activeEngine) {
      if (prev === "youtube") ytRef.current?.stopAndReset();
      if (prev === "html5") html5Ref.current?.stopAndReset();
      if (prev === "soundcloud-widget") scWidgetRef.current?.stopAndReset();
    }
    prevEngineRef.current = activeEngine;
  }, [activeEngine]);

  // SOUNDCLOUD STREAM RESOLUTION: try progressive MP3 for HTML5 <audio>, fallback to Widget
  useEffect(() => {
    if (
      !currentTrack ||
      currentTrack.source !== "soundcloud" ||
      isDirectAudioUrl(currentTrack.streamUrl) ||
      scWidgetFallbackIds.has(currentTrack.id) ||
      scResolvingId === currentTrack.id
    ) {
      return;
    }

    setScResolvingId(currentTrack.id);
    setIsLoading(true);

    fetch(
      `/api/stream/soundcloud?url=${encodeURIComponent(currentTrack.sourceUrl)}`,
      { headers: getByokHeaders() }
    )
      .then((res) => res.json())
      .then(
        (data: {
          streamUrl?: string;
          streamType?: "progressive" | "hls" | "widget";
        }) => {
          if (data.streamUrl && data.streamType === "progressive") {
            updateTrackInStore({
              ...currentTrack,
              streamUrl: data.streamUrl,
            });
          } else {
            setScWidgetFallbackIds((prev) => new Set(prev).add(currentTrack.id));
          }
        }
      )
      .catch(() => {
        setScWidgetFallbackIds((prev) => new Set(prev).add(currentTrack.id));
      })
      .finally(() => {
        setScResolvingId(null);
      });
  }, [
    currentTrack,
    scWidgetFallbackIds,
    scResolvingId,
    setIsLoading,
    updateTrackInStore,
  ]);

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
            "Chưa tìm thấy luồng phát cho bài Spotify này. Hãy nhập YouTube API Key trong API Settings (BYOK) hoặc .env.local."
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

  // LAZY PREFETCH: prefetch only the immediate next unmatched Spotify track
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

  // Handle seek requests from SeekBar / MediaSession
  useEffect(() => {
    if (seekTarget === null) return;
    if (activeEngine === "youtube") ytRef.current?.seekTo(seekTarget);
    if (activeEngine === "html5") html5Ref.current?.seekTo(seekTarget);
    if (activeEngine === "soundcloud-widget") {
      scWidgetRef.current?.seekTo(seekTarget);
    }
    clearSeekTarget();
  }, [seekTarget, activeEngine, clearSeekTarget]);

  // MEDIA SESSION API synchronization (hardware media keys & lock screen)
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    if (currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: `HnBee Music · ${currentTrack.source.toUpperCase()}`,
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
    } catch {}
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

  const handleHtml5Error = useCallback(() => {
    // If SoundCloud progressive MP3 expires or fails, smoothly fall back to Widget API
    if (currentTrack?.source === "soundcloud") {
      setScWidgetFallbackIds((prev) => new Set(prev).add(currentTrack.id));
    } else {
      setPlaybackError("Không thể phát luồng âm thanh trực tiếp này.");
    }
  }, [currentTrack, setPlaybackError]);

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
      <Html5AudioAdapter
        ref={html5Ref}
        streamUrl={html5StreamUrl}
        active={activeEngine === "html5"}
        isPlaying={activeEngine === "html5" && isPlaying}
        volume={effectiveVolume}
        onProgress={setProgress}
        onDuration={setDuration}
        onStateChange={handleStateChange}
        onEnded={handleEnded}
        onError={handleHtml5Error}
      />
      <SoundCloudAdapter
        ref={scWidgetRef}
        trackUrl={soundCloudWidgetUrl}
        active={activeEngine === "soundcloud-widget"}
        isPlaying={activeEngine === "soundcloud-widget" && isPlaying}
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
