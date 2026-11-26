"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { usePlaybackTimeStore } from "@/store/usePlaybackTimeStore";
import { getByokHeaders, useSettingsStore } from "@/store/useSettingsStore";
import { extractYouTubeId } from "@/lib/audio/url-parser";
import { smoothVolumeRamp } from "@/lib/audio/crossfade";
import { getCachedStream, setCachedStream } from "@/lib/audio/stream-cache";
import { useMediaSession } from "@/hooks/useMediaSession";
import {
  fetchSponsorSegments,
  findActiveSponsorSegment,
  getSponsorCategoryLabel,
  getSponsorSegmentKey,
  type SponsorSegment,
} from "@/lib/sponsorblock";
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
 * - YouTube Engine: privacy-enhanced youtube-nocookie.com IFrame + Clean Audio Fallback (Piped/Invidious/SoundCloud)
 * - SponsorBlock Auto-Skip: automatically seeks past ads, intros, outros, and non-music MV segments
 * - HTML5 Audio Engine: native <audio> for ad-free SoundCloud progressive MP3 & clean YouTube audio streams
 * - SoundCloud 30s Snippet Guard: upgrades Go+ 30s previews to full-length tracks automatically
 * - Single Active Engine: immediately pauses & resets (currentTime = 0) all inactive engines
 * - Media Session API: keyboard media keys & mobile lock-screen controls
 */
export function AudioEngineManager() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const queue = usePlayerStore((s) => s.queue);
  const queueIndex = usePlayerStore((s) => s.queueIndex);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const seekTarget = usePlayerStore((s) => s.seekTarget);

  const setProgress = usePlaybackTimeStore((s) => s.setProgress);
  const setDuration = usePlaybackTimeStore((s) => s.setDuration);
  const setIsPlaying = usePlayerStore((s) => s.setIsPlaying);
  const setIsLoading = usePlayerStore((s) => s.setIsLoading);
  const setPlaybackError = usePlayerStore((s) => s.setPlaybackError);
  const setPlaybackNotice = usePlayerStore((s) => s.setPlaybackNotice);
  const clearSeekTarget = usePlayerStore((s) => s.clearSeekTarget);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrev = usePlayerStore((s) => s.playPrev);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const updateTrackInStore = usePlayerStore((s) => s.updateTrackInStore);

  const autoSkipSponsor = useSettingsStore((s) => s.autoSkipSponsor);
  const audioOnlyMode = useSettingsStore((s) => s.audioOnlyMode);
  const crossfadeDuration = useSettingsStore((s) => s.crossfadeDuration);

  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const keepAliveCtxRef = useRef<AudioContext | null>(null);
  // Smart Gapless Preload & Smooth Crossfade refs
  const preloadRequestIdRef = useRef<number>(0);
  const preloadedTrackRef = useRef<{ id: string; ready: boolean } | null>(null);
  const autoCrossfadeTriggeredRef = useRef<string | null>(null);
  const pendingFadeInMsRef = useRef<number>(300);
  const activeRampCancelRef = useRef<(() => void) | null>(null);
  const [rampedVolume, setRampedVolume] = useState<number | null>(null);

  // SSR-safe mobile detection
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setIsMobileDevice(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  // Lightweight Silent AudioContext keep-alive during track transitions so iOS/Android never revoke background playback
  useEffect(() => {
    if (typeof window === "undefined" || !isPlaying || !currentTrack) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      if (!keepAliveCtxRef.current) {
        keepAliveCtxRef.current = new AudioCtx();
      }
      const ctx = keepAliveCtxRef.current;
      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => {});
      }
      // Schedule a 200ms silent buffer pulse on track start/switch to retain audio session focus
      const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 0.2)), ctx.sampleRate);
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
    } catch {}
  }, [currentTrack?.id, isPlaying]);

  const ytRef = useRef<EngineHandle | null>(null);
  const html5Ref = useRef<EngineHandle | null>(null);
  const scWidgetRef = useRef<EngineHandle | null>(null);
  const prevEngineRef = useRef<ActiveEngine>(null);
  const matchingIdsRef = useRef<Set<string>>(new Set());
  const ytFallbackAttemptedRef = useRef<Set<string>>(new Set());
  // Monotonic playback session ID to cancel stale async stream resolutions on iOS Safari
  const playRequestIdRef = useRef<number>(0);

  // Increment playRequestId immediately whenever the active track changes
  useEffect(() => {
    playRequestIdRef.current += 1;
  }, [currentTrack?.id]);

  // SponsorBlock state refs (avoid React re-renders on every 250ms progress tick)
  const sponsorSegmentsRef = useRef<SponsorSegment[]>([]);
  const skippedSponsorKeysRef = useRef<Set<string>>(new Set());
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track IDs that fell back to SoundCloud Widget after HTML5 stream extraction failed
  const [scWidgetFallbackIds, setScWidgetFallbackIds] = useState<Set<string>>(
    () => new Set()
  );
  const [scResolvingId, setScResolvingId] = useState<string | null>(null);

  // Direct clean audio URL overrides (Piped / Invidious / SoundCloud clean fallback for YouTube)
  const [cleanAudioOverrides, setCleanAudioOverrides] = useState<
    Record<
      string,
      {
        url: string;
        engine: "html5" | "soundcloud-widget";
        preservesYouTubeTimeline: boolean;
      }
    >
  >({});

  const effectiveVolume = isMuted ? 0 : volume;
  const outputVolume = rampedVolume !== null ? rampedVolume : effectiveVolume;

  // Determine the immediate next track in queue for Smart Gapless Preload & Auto-Crossfade
  const upcomingTrack = useMemo(() => {
    if (!currentTrack || queue.length === 0 || repeatMode === "one") return null;
    const baseIdx =
      queue[queueIndex]?.id === currentTrack.id
        ? queueIndex
        : queue.findIndex((t) => t.id === currentTrack.id);
    if (baseIdx < 0) return null;
    if (baseIdx + 1 < queue.length) return queue[baseIdx + 1];
    if (repeatMode === "all" && queue.length > 1) return queue[0];
    return null;
  }, [currentTrack, queue, queueIndex, repeatMode]);

  // Cancel stale preload & trigger smooth Fade-In whenever active track changes
  useEffect(() => {
    preloadRequestIdRef.current += 1;
    autoCrossfadeTriggeredRef.current = null;

    if (activeRampCancelRef.current) {
      activeRampCancelRef.current();
      activeRampCancelRef.current = null;
    }

    if (!currentTrack || effectiveVolume <= 0) {
      setRampedVolume(null);
      return;
    }

    const fadeInMs = pendingFadeInMsRef.current;
    pendingFadeInMsRef.current = 300; // Default 300ms gentle Fade-In on manual skip

    if (fadeInMs > 0 && isPlaying) {
      setRampedVolume(0);
      activeRampCancelRef.current = smoothVolumeRamp({
        from: 0,
        to: effectiveVolume,
        durationMs: fadeInMs,
        onStep: (v) => setRampedVolume(v),
        onComplete: () => {
          setRampedVolume(null);
          activeRampCancelRef.current = null;
        },
      });
    } else {
      setRampedVolume(null);
    }

    return () => {
      if (activeRampCancelRef.current) {
        activeRampCancelRef.current();
        activeRampCancelRef.current = null;
      }
    };
    // Intentionally triggers on track switch only (user volume slider changes cancel ramp below)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id]);

  // If user manually drags volume slider or toggles mute, immediately honor their volume
  useEffect(() => {
    if (activeRampCancelRef.current && autoCrossfadeTriggeredRef.current !== currentTrack?.id) {
      activeRampCancelRef.current();
      activeRampCancelRef.current = null;
      setRampedVolume(null);
    }
  }, [effectiveVolume, currentTrack?.id]);

  const showNotice = useCallback(
    (message: string) => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      setPlaybackNotice(message);
      noticeTimerRef.current = setTimeout(() => {
        setPlaybackNotice(null);
      }, 3600);
    },
    [setPlaybackNotice]
  );

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  // Determine active playback engine & resolved media target
  const {
    activeEngine,
    youtubeVideoId,
    sponsorBlockVideoId,
    html5StreamUrl,
    soundCloudWidgetUrl,
  } = useMemo(() => {
    if (!currentTrack) {
      return {
        activeEngine: null as ActiveEngine,
        youtubeVideoId: null as string | null,
        sponsorBlockVideoId: null as string | null,
        html5StreamUrl: null as string | null,
        soundCloudWidgetUrl: null as string | null,
      };
    }

    const ytIdForTrack =
      currentTrack.source === "youtube"
        ? extractYouTubeId(currentTrack.sourceUrl)
        : currentTrack.resolvedSource === "youtube" && currentTrack.streamUrl
        ? extractYouTubeId(currentTrack.streamUrl)
        : null;

    // 0. Clean Audio Stream Override (Piped/Invidious/SoundCloud fallback for blocked/stalled YouTube)
    const cleanOverride = cleanAudioOverrides[currentTrack.id];
    if (cleanOverride?.url) {
      if (cleanOverride.engine === "soundcloud-widget") {
        return {
          activeEngine: "soundcloud-widget" as ActiveEngine,
          youtubeVideoId: null,
          sponsorBlockVideoId: null,
          html5StreamUrl: null,
          soundCloudWidgetUrl: cleanOverride.url,
        };
      }
      return {
        activeEngine: "html5" as ActiveEngine,
        youtubeVideoId: null,
        sponsorBlockVideoId: cleanOverride.preservesYouTubeTimeline
          ? ytIdForTrack
          : null,
        html5StreamUrl: cleanOverride.url,
        soundCloudWidgetUrl: null,
      };
    }

    // 1. Direct HTML5 audio stream (SoundCloud extracted progressive MP3 or direct audio URL)
    if (
      isDirectAudioUrl(currentTrack.streamUrl) &&
      !scWidgetFallbackIds.has(currentTrack.id)
    ) {
      return {
        activeEngine: "html5" as ActiveEngine,
        youtubeVideoId: null,
        sponsorBlockVideoId: null,
        html5StreamUrl: currentTrack.streamUrl!,
        soundCloudWidgetUrl: null,
      };
    }

    // 2. YouTube native track (or SoundCloud 30s snippet upgraded to full YouTube track)
    if (
      currentTrack.source === "youtube" ||
      (currentTrack.resolvedSource === "youtube" && currentTrack.streamUrl)
    ) {
      return {
        activeEngine: "youtube" as ActiveEngine,
        youtubeVideoId: ytIdForTrack,
        sponsorBlockVideoId: ytIdForTrack,
        html5StreamUrl: null,
        soundCloudWidgetUrl: null,
      };
    }

    // 3. SoundCloud track (waits for progressive MP3 extraction or snippet upgrade, else falls back to Widget)
    if (currentTrack.source === "soundcloud") {
      if (scWidgetFallbackIds.has(currentTrack.id)) {
        return {
          activeEngine: "soundcloud-widget" as ActiveEngine,
          youtubeVideoId: null,
          sponsorBlockVideoId: null,
          html5StreamUrl: null,
          soundCloudWidgetUrl: currentTrack.sourceUrl,
        };
      }
      return {
        activeEngine: null as ActiveEngine,
        youtubeVideoId: null,
        sponsorBlockVideoId: null,
        html5StreamUrl: null,
        soundCloudWidgetUrl: null,
      };
    }

    // 4. Spotify track matched to SoundCloud -> wait for progressive MP3 extraction first, then Widget fallback
    if (
      currentTrack.resolvedSource === "soundcloud" &&
      currentTrack.streamUrl
    ) {
      if (scWidgetFallbackIds.has(currentTrack.id)) {
        return {
          activeEngine: "soundcloud-widget" as ActiveEngine,
          youtubeVideoId: null,
          sponsorBlockVideoId: null,
          html5StreamUrl: null,
          soundCloudWidgetUrl: currentTrack.streamUrl,
        };
      }
      return {
        activeEngine: null as ActiveEngine,
        youtubeVideoId: null,
        sponsorBlockVideoId: null,
        html5StreamUrl: null,
        soundCloudWidgetUrl: null,
      };
    }

    return {
      activeEngine: null as ActiveEngine,
      youtubeVideoId: null,
      sponsorBlockVideoId: null,
      html5StreamUrl: null,
      soundCloudWidgetUrl: null,
    };
  }, [currentTrack, scWidgetFallbackIds, cleanAudioOverrides]);

  // SPONSORBLOCK: fetch skip segments whenever a YouTube videoId becomes active
  useEffect(() => {
    sponsorSegmentsRef.current = [];
    skippedSponsorKeysRef.current = new Set();

    if (!sponsorBlockVideoId || !autoSkipSponsor) return;

    let cancelled = false;
    fetchSponsorSegments(sponsorBlockVideoId).then((segments) => {
      if (!cancelled) {
        sponsorSegmentsRef.current = segments;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sponsorBlockVideoId, autoSkipSponsor]);

  // Cleanup AudioContext on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (keepAliveCtxRef.current) {
        void keepAliveCtxRef.current.close().catch(() => {});
        keepAliveCtxRef.current = null;
      }
    };
  }, []);

  // SINGLE ACTIVE ENGINE (Zero Double-Audio): pause & reset ALL inactive engines immediately
  useEffect(() => {
    if (activeEngine !== "youtube") ytRef.current?.stopAndReset();
    if (activeEngine !== "html5") html5Ref.current?.stopAndReset();
    if (activeEngine !== "soundcloud-widget") scWidgetRef.current?.stopAndReset();
    prevEngineRef.current = activeEngine;
  }, [activeEngine]);

  // SOUNDCLOUD STREAM RESOLUTION: extract ad-free progressive MP3, upgrade 30s Go+ SNIPPET to full YouTube match
  useEffect(() => {
    if (!currentTrack) return;

    const isNativeSc =
      currentTrack.source === "soundcloud" &&
      currentTrack.resolvedSource !== "youtube";
    const isSpotifyMatchedSc =
      currentTrack.source === "spotify" &&
      currentTrack.resolvedSource === "soundcloud" &&
      Boolean(currentTrack.streamUrl) &&
      !isDirectAudioUrl(currentTrack.streamUrl);

    if (
      (!isNativeSc && !isSpotifyMatchedSc) ||
      isDirectAudioUrl(currentTrack.streamUrl) ||
      scWidgetFallbackIds.has(currentTrack.id) ||
      scResolvingId === currentTrack.id
    ) {
      return;
    }

    const targetScUrl = isSpotifyMatchedSc
      ? currentTrack.streamUrl!
      : currentTrack.sourceUrl;
    const reqId = playRequestIdRef.current;
    const targetTrack = currentTrack;

    setScResolvingId(targetTrack.id);
    setIsLoading(true);

    fetch(`/api/stream/soundcloud?url=${encodeURIComponent(targetScUrl)}`, {
      headers: getByokHeaders(),
    })
      .then((res) => res.json())
      .then(
        async (data: {
          streamUrl?: string;
          streamType?: "progressive" | "hls" | "widget";
          isSnippet?: boolean;
        }) => {
          if (reqId !== playRequestIdRef.current) return;

          // 30s Go+ SNIPPET guard -> upgrade to full-length YouTube clean match
          if (data.isSnippet) {
            try {
              const upgradeRes = await fetch("/api/resolve", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...getByokHeaders(),
                },
                body: JSON.stringify({
                  matchTrack: { ...targetTrack, isSnippet: true },
                }),
              });
              if (reqId !== playRequestIdRef.current) return;
              const upgradeData = (await upgradeRes.json()) as {
                track?: typeof targetTrack;
              };
              if (
                upgradeData.track?.streamUrl &&
                upgradeData.track?.resolvedSource === "youtube"
              ) {
                updateTrackInStore(upgradeData.track);
                showNotice(
                  "Bản SoundCloud chỉ là nghe thử 30s — đã tự động chuyển sang bản đầy đủ"
                );
                return;
              }
            } catch {}
          }

          if (reqId !== playRequestIdRef.current) return;

          if (data.streamUrl && data.streamType === "progressive") {
            updateTrackInStore({
              ...targetTrack,
              streamUrl: data.streamUrl,
            });
          } else {
            setScWidgetFallbackIds((prev) => new Set(prev).add(targetTrack.id));
          }
        }
      )
      .catch(() => {
        if (reqId !== playRequestIdRef.current) return;
        setScWidgetFallbackIds((prev) => new Set(prev).add(targetTrack.id));
      })
      .finally(() => {
        setScResolvingId(null);
      });
  }, [
    currentTrack,
    scWidgetFallbackIds,
    scResolvingId,
    setIsLoading,
    showNotice,
    updateTrackInStore,
  ]);

  // LAZY STREAM MATCHING for Spotify current track (0ms persistent localStorage cache first!)
  useEffect(() => {
    if (
      !currentTrack ||
      currentTrack.source !== "spotify" ||
      (currentTrack.streamUrl && currentTrack.resolvedSource)
    ) {
      return;
    }

    // 0ms Instant Cache Hit from hnbee_stream_cache_v1
    const cached = getCachedStream(currentTrack.id);
    if (cached) {
      updateTrackInStore({
        ...currentTrack,
        streamUrl: cached.streamUrl,
        resolvedSource: cached.resolvedSource,
      });
      return;
    }

    if (matchingIdsRef.current.has(currentTrack.id)) return;
    matchingIdsRef.current.add(currentTrack.id);
    const reqId = playRequestIdRef.current;
    const targetTrack = currentTrack;
    setIsLoading(true);

    fetch("/api/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getByokHeaders(),
      },
      body: JSON.stringify({ matchTrack: targetTrack }),
    })
      .then((res) => res.json())
      .then((data: { track?: typeof targetTrack }) => {
        if (data.track?.streamUrl && data.track?.resolvedSource) {
          setCachedStream(targetTrack.id, {
            youtubeId:
              data.track.resolvedSource === "youtube"
                ? extractYouTubeId(data.track.streamUrl) || undefined
                : undefined,
            streamUrl: data.track.streamUrl,
            resolvedSource: data.track.resolvedSource,
          });
          updateTrackInStore(data.track);
        } else if (reqId === playRequestIdRef.current) {
          setIsLoading(false);
          setIsPlaying(false);
          setPlaybackError(
            "Chưa tìm thấy luồng phát đầy đủ cho bài Spotify này."
          );
        }
      })
      .catch(() => {
        if (reqId !== playRequestIdRef.current) return;
        setIsLoading(false);
        setIsPlaying(false);
        setPlaybackError("Lỗi kết nối khi tìm luồng phát cho bài Spotify.");
      })
      .finally(() => {
        matchingIdsRef.current.delete(targetTrack.id);
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

  // Handle seek requests from SeekBar / MediaSession / SponsorBlock
  useEffect(() => {
    if (seekTarget === null) return;
    if (activeEngine === "youtube") ytRef.current?.seekTo(seekTarget);
    if (activeEngine === "html5") html5Ref.current?.seekTo(seekTarget);
    if (activeEngine === "soundcloud-widget") {
      scWidgetRef.current?.seekTo(seekTarget);
    }
    clearSeekTarget();
  }, [seekTarget, activeEngine, clearSeekTarget]);

  // MEDIA SESSION API (Lock Screen iOS/Android, Dynamic Island, Desktop Media Keys)
  const handleMediaPlay = useCallback(() => setIsPlaying(true), [setIsPlaying]);
  const handleMediaPause = useCallback(() => setIsPlaying(false), [setIsPlaying]);
  const handleMediaNext = useCallback(() => playNext(false), [playNext]);

  useMediaSession({
    currentTrack,
    isPlaying,
    onPlay: handleMediaPlay,
    onPause: handleMediaPause,
    onPrev: playPrev,
    onNext: handleMediaNext,
    onSeekTo: seekTo,
  });

  // AUDIO-FIRST / BACKGROUND BYPASS (Mobile iOS/Android, Audio Only Mode, or tab hidden)
  useEffect(() => {
    if (!currentTrack || !youtubeVideoId) return;
    if (cleanAudioOverrides[currentTrack.id]) return;

    const triggerAudioFirst = () => {
      if (ytFallbackAttemptedRef.current.has(currentTrack.id)) return;
      ytFallbackAttemptedRef.current.add(currentTrack.id);
      const reqId = playRequestIdRef.current;
      const trackId = currentTrack.id;
      const controller = new AbortController();
      // Strict 2.5s timeout -> YouTube IFrame Player plays immediately without waiting!
      const timeout = setTimeout(() => controller.abort(), 2500);
      const params = new URLSearchParams({
        v: youtubeVideoId,
        duration: String(currentTrack.duration || 0),
      });
      fetch(`/api/stream/youtube?${params.toString()}`, {
        headers: getByokHeaders(),
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then(
          (data: {
            streamUrl?: string | null;
            streamType?: "direct-audio" | "none";
          }) => {
            if (reqId !== playRequestIdRef.current) return;
            if (data.streamUrl && data.streamType === "direct-audio") {
              setCleanAudioOverrides((prev) => ({
                ...prev,
                [trackId]: {
                  url: data.streamUrl!,
                  engine: "html5",
                  preservesYouTubeTimeline: true,
                },
              }));
            }
          }
        )
        .catch(() => {})
        .finally(() => clearTimeout(timeout));
    };

    // Proactively use pure HTML5 <audio> on mobile or when Audio Only Mode is enabled
    if (audioOnlyMode || isMobileDevice) {
      triggerAudioFirst();
      return;
    }

    // On desktop, also upgrade to HTML5 <audio> if the tab goes into background while playing
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && isPlaying) {
        triggerAudioFirst();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    audioOnlyMode,
    cleanAudioOverrides,
    currentTrack,
    isMobileDevice,
    isPlaying,
    youtubeVideoId,
  ]);

  // Smart Gapless Preload helper (triggered at 75% progress or last 15s of current track)
  const triggerGaplessPreload = useCallback(() => {
    const nextTrack = upcomingTrack;
    if (!nextTrack) return;
    if (preloadedTrackRef.current?.id === nextTrack.id) return;

    const preloadId = ++preloadRequestIdRef.current;
    preloadedTrackRef.current = { id: nextTrack.id, ready: false };

    // 1. Preload unmatched Spotify track -> check 0ms localStorage cache first, else resolve & persist
    if (
      nextTrack.source === "spotify" &&
      !(nextTrack.streamUrl && nextTrack.resolvedSource)
    ) {
      const cachedNext = getCachedStream(nextTrack.id);
      if (cachedNext) {
        updateTrackInStore({
          ...nextTrack,
          streamUrl: cachedNext.streamUrl,
          resolvedSource: cachedNext.resolvedSource,
        });
        preloadedTrackRef.current = { id: nextTrack.id, ready: true };
        return;
      }

      fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getByokHeaders() },
        body: JSON.stringify({ matchTrack: nextTrack }),
      })
        .then((res) => res.json())
        .then((data: { track?: typeof nextTrack }) => {
          if (preloadId !== preloadRequestIdRef.current) return;
          if (data.track?.streamUrl && data.track?.resolvedSource) {
            setCachedStream(nextTrack.id, {
              youtubeId:
                data.track.resolvedSource === "youtube"
                  ? extractYouTubeId(data.track.streamUrl) || undefined
                  : undefined,
              streamUrl: data.track.streamUrl,
              resolvedSource: data.track.resolvedSource,
            });
            updateTrackInStore(data.track);
            preloadedTrackRef.current = { id: nextTrack.id, ready: true };
          }
        })
        .catch(() => {});
      return;
    }

    // 2. Preload SoundCloud progressive MP3 stream
    if (
      nextTrack.source === "soundcloud" &&
      !isDirectAudioUrl(nextTrack.streamUrl)
    ) {
      fetch(
        `/api/stream/soundcloud?url=${encodeURIComponent(nextTrack.sourceUrl)}`,
        { headers: getByokHeaders() }
      )
        .then((res) => res.json())
        .then(
          (data: {
            streamUrl?: string;
            streamType?: "progressive" | "hls" | "widget";
            isSnippet?: boolean;
          }) => {
            if (preloadId !== preloadRequestIdRef.current) return;
            if (data.streamUrl && data.streamType === "progressive" && !data.isSnippet) {
              updateTrackInStore({ ...nextTrack, streamUrl: data.streamUrl });
              preloadedTrackRef.current = { id: nextTrack.id, ready: true };
            }
          }
        )
        .catch(() => {});
      return;
    }

    // 3. Preload direct clean audio for YouTube track on mobile / Audio Only Mode
    const nextYtId =
      nextTrack.source === "youtube"
        ? extractYouTubeId(nextTrack.sourceUrl)
        : nextTrack.resolvedSource === "youtube" && nextTrack.streamUrl
        ? extractYouTubeId(nextTrack.streamUrl)
        : null;

    if (nextYtId && (audioOnlyMode || isMobileDevice)) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3500);
      const params = new URLSearchParams({
        v: nextYtId,
        duration: String(nextTrack.duration || 0),
      });
      fetch(`/api/stream/youtube?${params.toString()}`, {
        headers: getByokHeaders(),
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then(
          (data: {
            streamUrl?: string | null;
            streamType?: "direct-audio" | "none";
          }) => {
            if (preloadId !== preloadRequestIdRef.current) return;
            if (data.streamUrl && data.streamType === "direct-audio") {
              setCleanAudioOverrides((prev) => ({
                ...prev,
                [nextTrack.id]: {
                  url: data.streamUrl!,
                  engine: "html5",
                  preservesYouTubeTimeline: true,
                },
              }));
              preloadedTrackRef.current = { id: nextTrack.id, ready: true };
            }
          }
        )
        .catch(() => {})
        .finally(() => clearTimeout(t));
    }
  }, [upcomingTrack, audioOnlyMode, isMobileDevice, updateTrackInStore]);

  // Progress handler with integrated SponsorBlock, Smart Gapless Preload & Smooth Auto-Crossfade
  const handleProgress = useCallback(
    (seconds: number) => {
      setProgress(seconds);

      // 1. SponsorBlock Auto-Skip
      if (autoSkipSponsor && sponsorSegmentsRef.current.length > 0) {
        const activeSeg = findActiveSponsorSegment(
          seconds,
          sponsorSegmentsRef.current,
          skippedSponsorKeysRef.current
        );
        if (activeSeg) {
          skippedSponsorKeysRef.current.add(getSponsorSegmentKey(activeSeg));
          const targetTime = activeSeg.segment[1];
          seekTo(targetTime);
          showNotice(
            `Đã tự động bỏ qua ${getSponsorCategoryLabel(activeSeg.category)} trong MV`
          );
          return;
        }
      }

      const dur = usePlaybackTimeStore.getState().duration;
      if (!currentTrack || !Number.isFinite(dur) || dur <= 8) return;

      const remaining = dur - seconds;

      // 2. Instant Next-Track Preload as soon as current track plays for 3 seconds (or 75% / last 15s)
      if (
        upcomingTrack &&
        (seconds >= 3 || seconds / dur >= 0.75 || remaining <= 15)
      ) {
        triggerGaplessPreload();
      }

      // 3. Smooth Auto-Next Crossfade (Fade-Out current -> 0ms switch -> Fade-In preloaded next track)
      if (
        crossfadeDuration > 0 &&
        upcomingTrack &&
        repeatMode !== "one" &&
        remaining > 0.35 &&
        remaining <= crossfadeDuration &&
        autoCrossfadeTriggeredRef.current !== currentTrack.id
      ) {
        autoCrossfadeTriggeredRef.current = currentTrack.id;
        const fadeOutMs = Math.max(400, Math.min(remaining, crossfadeDuration) * 1000);
        const startVol = effectiveVolume;
        const fadeTargetTrackId = currentTrack.id;

        if (activeRampCancelRef.current) {
          activeRampCancelRef.current();
          activeRampCancelRef.current = null;
        }

        activeRampCancelRef.current = smoothVolumeRamp({
          from: startVol,
          to: 0,
          durationMs: fadeOutMs,
          onStep: (v) => setRampedVolume(v),
          onComplete: () => {
            activeRampCancelRef.current = null;
            if (usePlayerStore.getState().currentTrack?.id === fadeTargetTrackId) {
              pendingFadeInMsRef.current = Math.min(crossfadeDuration * 600, 1800);
              playNext(true);
            }
          },
        });
      }
    },
    [
      autoSkipSponsor,
      crossfadeDuration,
      currentTrack,
      effectiveVolume,
      playNext,
      repeatMode,
      seekTo,
      setProgress,
      showNotice,
      triggerGaplessPreload,
      upcomingTrack,
    ]
  );

  // YouTube Clean Audio Stream Fallback (when embed is blocked 101/150 or stalled > 4s on pre-roll)
  const handleYouTubeFallbackRequest = useCallback(
    async (reason: "embed_blocked" | "stall_timeout") => {
      if (!currentTrack || !youtubeVideoId) return;
      if (ytFallbackAttemptedRef.current.has(currentTrack.id)) {
        if (reason === "embed_blocked") {
          setIsPlaying(false);
          setIsLoading(false);
          setPlaybackError(
            "Video YouTube này không cho phép phát nhúng (embed)."
          );
        }
        return;
      }

      ytFallbackAttemptedRef.current.add(currentTrack.id);
      const reqId = playRequestIdRef.current;
      const trackId = currentTrack.id;

      try {
        const params = new URLSearchParams({
          v: youtubeVideoId,
          title: currentTrack.title,
          artist: currentTrack.artist,
          duration: String(currentTrack.duration || 0),
          // Only allow strictly-verified cross-source match when embed is hard-blocked (101/150)
          ...(reason === "embed_blocked" ? { allowCrossSource: "1" } : {}),
        });
        const res = await fetch(`/api/stream/youtube?${params.toString()}`, {
          headers: getByokHeaders(),
        });
        if (reqId !== playRequestIdRef.current) return;
        const data = (await res.json()) as {
          streamUrl?: string | null;
          streamType?:
            | "direct-audio"
            | "soundcloud-audio"
            | "soundcloud-widget"
            | "none";
        };

        if (data.streamUrl) {
          setCleanAudioOverrides((prev) => ({
            ...prev,
            [trackId]: {
              url: data.streamUrl!,
              engine:
                data.streamType === "soundcloud-widget"
                  ? "soundcloud-widget"
                  : "html5",
              preservesYouTubeTimeline: data.streamType === "direct-audio",
            },
          }));
          setPlaybackError(null);
          showNotice("Đã chuyển sang luồng Audio sạch không quảng cáo");
          return;
        }
      } catch {}

      if (reqId !== playRequestIdRef.current) return;

      if (reason === "embed_blocked") {
        // Tier 3: Both Tier 1 & Tier 2 failed -> show concise toast & skip to next track if queue has more
        if (queue.length > 1) {
          showNotice("Video bị chặn phát nhúng — tự động chuyển bài tiếp theo");
          playNext(false);
        } else {
          setIsPlaying(false);
          setIsLoading(false);
          setPlaybackError(
            "Video YouTube này bị chặn nhúng và chưa tìm thấy luồng âm thanh thay thế."
          );
        }
      }
    },
    [
      currentTrack,
      youtubeVideoId,
      queue.length,
      playNext,
      setIsLoading,
      setIsPlaying,
      setPlaybackError,
      showNotice,
    ]
  );

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
    if (!currentTrack) return;

    // If a YouTube clean-audio override URL failed/expired, revert cleanly
    if (cleanAudioOverrides[currentTrack.id]) {
      setCleanAudioOverrides((prev) => {
        const next = { ...prev };
        delete next[currentTrack.id];
        return next;
      });
      return;
    }

    // If SoundCloud progressive MP3 expires or fails, smoothly fall back to Widget API
    if (
      currentTrack.source === "soundcloud" ||
      currentTrack.resolvedSource === "soundcloud"
    ) {
      setScWidgetFallbackIds((prev) => new Set(prev).add(currentTrack.id));
    } else {
      setPlaybackError("Không thể phát luồng âm thanh trực tiếp này.");
    }
  }, [cleanAudioOverrides, currentTrack, setPlaybackError]);

  return (
    <>
      <YouTubeAdapter
        ref={ytRef}
        videoId={youtubeVideoId}
        active={activeEngine === "youtube"}
        isPlaying={activeEngine === "youtube" && isPlaying}
        volume={outputVolume}
        onProgress={handleProgress}
        onDuration={setDuration}
        onStateChange={handleStateChange}
        onEnded={handleEnded}
        onError={handleError}
        onFallbackRequest={handleYouTubeFallbackRequest}
      />
      <Html5AudioAdapter
        ref={html5Ref}
        streamUrl={html5StreamUrl}
        active={activeEngine === "html5"}
        isPlaying={activeEngine === "html5" && isPlaying}
        volume={outputVolume}
        onProgress={handleProgress}
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
        volume={outputVolume}
        onProgress={handleProgress}
        onDuration={setDuration}
        onStateChange={handleStateChange}
        onEnded={handleEnded}
        onError={handleError}
      />
    </>
  );
}
