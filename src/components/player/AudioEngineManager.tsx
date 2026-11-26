"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { usePlaybackTimeStore } from "@/store/usePlaybackTimeStore";
import { getByokHeaders, useSettingsStore } from "@/store/useSettingsStore";
import { extractYouTubeId } from "@/lib/audio/url-parser";
import { smoothVolumeRamp } from "@/lib/audio/crossfade";
import { isIOSDevice } from "@/lib/audio/ios-unlock";
import {
  clearCachedDirectAudioUrl,
  getCachedDirectAudioUrl,
  getCachedStream,
  setCachedDirectAudioUrl,
  setCachedStream,
} from "@/lib/audio/stream-cache";
import {
  syncMediaSessionOnPlaying,
  useMediaSession,
} from "@/hooks/useMediaSession";
import {
  fetchSponsorSegments,
  findActiveSponsorSegment,
  getSponsorCategoryLabel,
  getSponsorSegmentKey,
  type SponsorSegment,
} from "@/lib/sponsorblock";
import { YouTubeAdapter, type EngineHandle } from "./YouTubeAdapter";
import {
  Html5AudioAdapter,
  type Html5EngineHandle,
} from "./Html5AudioAdapter";
import { SoundCloudAdapter } from "./SoundCloudAdapter";

type ActiveEngine = "youtube" | "html5" | "soundcloud-widget" | null;

function isDirectAudioUrl(url?: string): boolean {
  if (!url) return false;
  return (
    url.startsWith("/api/proxy-audio") ||
    /\.(mp3|m4a|ogg|wav|aac|flac|opus|m3u8)(\?.*)?$/i.test(url) ||
    /cf-media\.sndcdn\.com|media\.soundcloud\.com|audio\.sndcdn\.com|soundcloud\.cloud|discoveryprovider\.audius\.co\/v1\/tracks\/[^/]+\/stream/i.test(
      url
    )
  );
}

/**
 * Unified Audio Engine Manager mounted ONCE in RootLayout (src/app/layout.tsx).
 * - iOS Mode (iPhone / iPad): Strictly enforces native HTML5 `<audio>` via `/api/audio-stream`
 *   (InnerTube iOS .m4a -> `/api/proxy-audio` + SoundCloud + Audius 3-source parallel race).
 *   NEVER mounts or uses YouTube Video IFrame on iOS so Home Screen & Lock Screen playback never stops!
 * - Desktop / Android Mode: privacy-enhanced youtube-nocookie.com IFrame + Clean Audio Fallback + SponsorBlock.
 * - Single Active Engine: immediately pauses & resets all inactive engines (zero double-audio).
 * - Media Session API: Lock Screen, Dynamic Island, Control Center & Desktop Media Keys.
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

  const [isIOS, setIsIOS] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const keepAliveCtxRef = useRef<AudioContext | null>(null);

  // Smart Gapless Preload & Smooth Crossfade refs
  const preloadRequestIdRef = useRef<number>(0);
  const preloadedTrackRef = useRef<{ id: string; ready: boolean } | null>(null);
  const autoCrossfadeTriggeredRef = useRef<string | null>(null);
  const pendingFadeInMsRef = useRef<number>(300);
  const activeRampCancelRef = useRef<(() => void) | null>(null);
  const [rampedVolume, setRampedVolume] = useState<number | null>(null);

  // SSR-safe iOS & mobile detection
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ios = isIOSDevice();
    setIsIOS(ios);
    setIsMobileDevice(ios || /Android/i.test(navigator.userAgent));
  }, []);

  // Lightweight Silent AudioContext keep-alive during track transitions so iOS/Android retain background audio session
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
      const buffer = ctx.createBuffer(
        1,
        Math.max(1, Math.floor(ctx.sampleRate * 0.2)),
        ctx.sampleRate
      );
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
  const html5Ref = useRef<Html5EngineHandle | null>(null);
  const scWidgetRef = useRef<EngineHandle | null>(null);
  const prevEngineRef = useRef<ActiveEngine>(null);
  const matchingIdsRef = useRef<Set<string>>(new Set());
  const ytFallbackAttemptedRef = useRef<Set<string>>(new Set());
  const iosAudioInFlightRef = useRef<Set<string>>(new Set());
  const iosAudioRetriedRef = useRef<Set<string>>(new Set());
  // Monotonic playback session ID to cancel stale async stream resolutions
  const playRequestIdRef = useRef<number>(0);

  // Increment playRequestId immediately whenever the active track changes
  useEffect(() => {
    playRequestIdRef.current += 1;
  }, [currentTrack?.id]);

  // SponsorBlock state refs (avoid React re-renders on every 250ms progress tick)
  const sponsorSegmentsRef = useRef<SponsorSegment[]>([]);
  const skippedSponsorKeysRef = useRef<Set<string>>(new Set());
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track IDs that fell back to SoundCloud Widget after HTML5 stream extraction failed (non-iOS)
  const [scWidgetFallbackIds, setScWidgetFallbackIds] = useState<Set<string>>(
    () => new Set()
  );
  const [scResolvingId, setScResolvingId] = useState<string | null>(null);

  // Direct clean audio URL overrides (iOS `/api/audio-stream`, Piped/Invidious/SoundCloud)
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

    // On iOS, HTML5 audio.volume is read-only (controlled by hardware buttons), so skip JS volume ramping
    if (!isIOS && fadeInMs > 0 && isPlaying) {
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
    // Intentionally triggers on track switch only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id]);

  // If user manually drags volume slider or toggles mute, immediately honor their volume
  useEffect(() => {
    if (
      activeRampCancelRef.current &&
      autoCrossfadeTriggeredRef.current !== currentTrack?.id
    ) {
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

  // Helper: fetch direct audio-only URL from `/api/audio-stream` (3-source parallel race, 3.5s server timeout)
  const fetchDirectAudioStreamForTrack = useCallback(
    async (
      track: NonNullable<typeof currentTrack>,
      ytId: string | null,
      signal?: AbortSignal
    ): Promise<{
      streamUrl: string;
      preservesYouTubeTimeline: boolean;
    } | null> => {
      const params = new URLSearchParams();
      if (ytId) params.set("id", ytId);
      if (track.title) params.set("title", track.title);
      if (track.artist) params.set("artist", track.artist);
      if (track.duration > 0) params.set("duration", String(track.duration));
      if (
        track.source === "soundcloud" ||
        (track.resolvedSource === "soundcloud" && track.streamUrl)
      ) {
        params.set(
          "scUrl",
          track.source === "soundcloud" ? track.sourceUrl : track.streamUrl!
        );
      }

      const res = await fetch(`/api/audio-stream?${params.toString()}`, {
        headers: getByokHeaders(),
        signal,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        streamUrl?: string | null;
        preservesYouTubeTimeline?: boolean;
      };
      if (!data.streamUrl) return null;
      return {
        streamUrl: data.streamUrl,
        preservesYouTubeTimeline: Boolean(data.preservesYouTubeTimeline),
      };
    },
    []
  );

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

    // 0. Clean Direct Audio Stream Override (iOS `/api/audio-stream` or Desktop/Android fallback)
    const cleanOverride = cleanAudioOverrides[currentTrack.id];
    if (cleanOverride?.url) {
      if (!isIOS && cleanOverride.engine === "soundcloud-widget") {
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

    // 1. Direct HTML5 audio stream (SoundCloud progressive MP3 / HLS or /api/proxy-audio)
    if (
      isDirectAudioUrl(currentTrack.streamUrl) &&
      (!scWidgetFallbackIds.has(currentTrack.id) || isIOS)
    ) {
      return {
        activeEngine: "html5" as ActiveEngine,
        youtubeVideoId: null,
        sponsorBlockVideoId: null,
        html5StreamUrl: currentTrack.streamUrl!,
        soundCloudWidgetUrl: null,
      };
    }

    // iOS STRICT RULE: NEVER use YouTube Video IFrame or SoundCloud IFrame on iPhone/iPad!
    // Hold in loading state while `/api/audio-stream` fetches direct HTML5 <audio> URL (~800ms or 0ms cached).
    if (isIOS) {
      return {
        activeEngine: null as ActiveEngine,
        youtubeVideoId: ytIdForTrack,
        sponsorBlockVideoId: ytIdForTrack,
        html5StreamUrl: null,
        soundCloudWidgetUrl: null,
      };
    }

    // 2. YouTube native track (Desktop / Android)
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

    // 3. SoundCloud track (Desktop / Android)
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

    // 4. Spotify track matched to SoundCloud (Desktop / Android)
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
  }, [currentTrack, scWidgetFallbackIds, cleanAudioOverrides, isIOS]);

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

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      if (keepAliveCtxRef.current) {
        void keepAliveCtxRef.current.close().catch(() => {});
        keepAliveCtxRef.current = null;
      }
    };
  }, []);

  // SINGLE ACTIVE ENGINE (Zero Double-Audio): pause & reset inactive engines immediately
  useEffect(() => {
    if (activeEngine !== "youtube") ytRef.current?.stopAndReset();
    if (activeEngine !== "html5") {
      // On iOS, NEVER strip `<audio>` src while briefly resolving next track's direct audio URL
      if (!isIOS || !currentTrack) {
        html5Ref.current?.stopAndReset();
      }
    }
    if (activeEngine !== "soundcloud-widget") scWidgetRef.current?.stopAndReset();
    prevEngineRef.current = activeEngine;
  }, [activeEngine, isIOS, currentTrack]);

  // iOS MANDATORY DIRECT AUDIO-ONLY RESOLVER (`/api/audio-stream` -> native HTML5 `<audio>`)
  useEffect(() => {
    if (!isIOS || !currentTrack) return;
    if (cleanAudioOverrides[currentTrack.id]?.url) return;
    if (isDirectAudioUrl(currentTrack.streamUrl)) return;

    // For unmatched Spotify tracks, wait for the fast Spotify matcher to supply youtubeId/streamUrl first
    // (unless it already has a cached direct audio URL in localStorage!)
    const cachedDirect = getCachedDirectAudioUrl(currentTrack.id);
    if (cachedDirect) {
      setCleanAudioOverrides((prev) => ({
        ...prev,
        [currentTrack.id]: {
          url: cachedDirect,
          engine: "html5",
          preservesYouTubeTimeline: Boolean(youtubeVideoId),
        },
      }));
      return;
    }

    if (
      currentTrack.source === "spotify" &&
      !(currentTrack.streamUrl && currentTrack.resolvedSource)
    ) {
      return;
    }

    if (iosAudioInFlightRef.current.has(currentTrack.id)) return;
    iosAudioInFlightRef.current.add(currentTrack.id);

    const reqId = playRequestIdRef.current;
    const targetTrack = currentTrack;
    const targetYtId = youtubeVideoId;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    setIsLoading(true);

    fetchDirectAudioStreamForTrack(targetTrack, targetYtId, controller.signal)
      .then((result) => {
        if (reqId !== playRequestIdRef.current) return;
        if (result?.streamUrl) {
          setCachedDirectAudioUrl(targetTrack.id, result.streamUrl, {
            streamUrl: targetTrack.streamUrl || targetTrack.sourceUrl,
            resolvedSource:
              targetTrack.resolvedSource ||
              (targetTrack.source === "soundcloud" ? "soundcloud" : "youtube"),
            youtubeId: targetYtId || undefined,
          });
          setCleanAudioOverrides((prev) => ({
            ...prev,
            [targetTrack.id]: {
              url: result.streamUrl,
              engine: "html5",
              preservesYouTubeTimeline: result.preservesYouTubeTimeline,
            },
          }));
          setPlaybackError(null);
        } else {
          setIsLoading(false);
          if (queue.length > 1) {
            showNotice(
              "Không lấy được luồng Audio iOS cho bài này — tự động chuyển bài tiếp theo"
            );
            playNext(false);
          } else {
            setIsPlaying(false);
            setPlaybackError(
              "Chưa thể giải mã luồng âm thanh nền iOS cho bài hát này."
            );
          }
        }
      })
      .catch(() => {
        if (reqId !== playRequestIdRef.current) return;
        setIsLoading(false);
        setIsPlaying(false);
        setPlaybackError("Kết nối quá hạn khi tải luồng âm thanh nền iOS.");
      })
      .finally(() => {
        clearTimeout(timeout);
        iosAudioInFlightRef.current.delete(targetTrack.id);
      });
  }, [
    isIOS,
    currentTrack,
    cleanAudioOverrides,
    youtubeVideoId,
    fetchDirectAudioStreamForTrack,
    setIsLoading,
    setIsPlaying,
    setPlaybackError,
    showNotice,
    queue.length,
    playNext,
  ]);

  // SOUNDCLOUD STREAM RESOLUTION (Desktop / Android): extract ad-free progressive MP3, upgrade 30s Go+ SNIPPET
  useEffect(() => {
    if (!currentTrack || isIOS) return;

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
    isIOS,
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

    const cachedNext = getCachedStream(nextTrack.id);
    if (cachedNext) {
      updateTrackInStore({
        ...nextTrack,
        streamUrl: cachedNext.streamUrl,
        resolvedSource: cachedNext.resolvedSource,
      });
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
          setCachedStream(nextTrack.id, {
            youtubeId:
              data.track.resolvedSource === "youtube"
                ? extractYouTubeId(data.track.streamUrl) || undefined
                : undefined,
            streamUrl: data.track.streamUrl,
            resolvedSource: data.track.resolvedSource,
          });
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

  // MEDIA SESSION API (Lock Screen iOS/Android, Control Center, Dynamic Island, Desktop Media Keys)
  const handleMediaPlay = useCallback(() => {
    setIsPlaying(true);
    if (activeEngine === "html5") html5Ref.current?.play();
  }, [setIsPlaying, activeEngine]);

  const handleMediaPause = useCallback(() => {
    setIsPlaying(false);
    if (activeEngine === "html5") html5Ref.current?.pause();
  }, [setIsPlaying, activeEngine]);

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

  // Immediately reinforce navigator.mediaSession inside the native `<audio>` `playing` event for iOS Control Center & Lock Screen
  const handleHtml5Playing = useCallback(() => {
    syncMediaSessionOnPlaying(currentTrack, {
      onPlay: handleMediaPlay,
      onPause: handleMediaPause,
      onPrev: playPrev,
      onNext: handleMediaNext,
      onSeekTo: seekTo,
    });
  }, [
    currentTrack,
    handleMediaNext,
    handleMediaPause,
    handleMediaPlay,
    playPrev,
    seekTo,
  ]);

  // AUDIO-FIRST / BACKGROUND BYPASS for Android & Desktop Audio-Only Mode (non-iOS; iOS already uses `/api/audio-stream` exclusively)
  useEffect(() => {
    if (isIOS || !currentTrack || !youtubeVideoId) return;
    if (cleanAudioOverrides[currentTrack.id]) return;

    const triggerAudioFirst = () => {
      if (ytFallbackAttemptedRef.current.has(currentTrack.id)) return;
      ytFallbackAttemptedRef.current.add(currentTrack.id);
      const reqId = playRequestIdRef.current;
      const trackId = currentTrack.id;
      const controller = new AbortController();
      // Strict 2.5s timeout -> YouTube IFrame Player continues immediately on Desktop/Android
      const timeout = setTimeout(() => controller.abort(), 2500);
      fetchDirectAudioStreamForTrack(
        currentTrack,
        youtubeVideoId,
        controller.signal
      )
        .then((result) => {
          if (reqId !== playRequestIdRef.current) return;
          if (result?.streamUrl) {
            setCleanAudioOverrides((prev) => ({
              ...prev,
              [trackId]: {
                url: result.streamUrl,
                engine: "html5",
                preservesYouTubeTimeline: result.preservesYouTubeTimeline,
              },
            }));
          }
        })
        .catch(() => {})
        .finally(() => clearTimeout(timeout));
    };

    if (audioOnlyMode || isMobileDevice) {
      triggerAudioFirst();
      return;
    }

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
    isIOS,
    audioOnlyMode,
    cleanAudioOverrides,
    currentTrack,
    fetchDirectAudioStreamForTrack,
    isMobileDevice,
    isPlaying,
    youtubeVideoId,
  ]);

  // Smart Gapless Preload helper (triggered at 3s AND >= 70% / last 15s of current track)
  const triggerGaplessPreload = useCallback(() => {
    const nextTrack = upcomingTrack;
    if (!nextTrack) return;
    if (preloadedTrackRef.current?.id === nextTrack.id && preloadedTrackRef.current.ready) {
      return;
    }
    if (preloadedTrackRef.current?.id === nextTrack.id) return;

    const preloadId = ++preloadRequestIdRef.current;
    preloadedTrackRef.current = { id: nextTrack.id, ready: false };

    const preloadDirectAudioForNext = (
      resolvedNext: typeof nextTrack,
      nextYtId: string | null
    ) => {
      if (!isIOS && !audioOnlyMode && !isMobileDevice) {
        preloadedTrackRef.current = { id: resolvedNext.id, ready: true };
        return;
      }
      const cachedDirect = getCachedDirectAudioUrl(resolvedNext.id);
      if (cachedDirect) {
        setCleanAudioOverrides((prev) => ({
          ...prev,
          [resolvedNext.id]: {
            url: cachedDirect,
            engine: "html5",
            preservesYouTubeTimeline: Boolean(nextYtId),
          },
        }));
        preloadedTrackRef.current = { id: resolvedNext.id, ready: true };
        return;
      }

      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 4500);
      fetchDirectAudioStreamForTrack(resolvedNext, nextYtId, controller.signal)
        .then((result) => {
          if (preloadId !== preloadRequestIdRef.current) return;
          if (result?.streamUrl) {
            setCachedDirectAudioUrl(resolvedNext.id, result.streamUrl, {
              streamUrl: resolvedNext.streamUrl || resolvedNext.sourceUrl,
              resolvedSource:
                resolvedNext.resolvedSource ||
                (resolvedNext.source === "soundcloud" ? "soundcloud" : "youtube"),
              youtubeId: nextYtId || undefined,
            });
            setCleanAudioOverrides((prev) => ({
              ...prev,
              [resolvedNext.id]: {
                url: result.streamUrl,
                engine: "html5",
                preservesYouTubeTimeline: result.preservesYouTubeTimeline,
              },
            }));
            preloadedTrackRef.current = { id: resolvedNext.id, ready: true };
          }
        })
        .catch(() => {})
        .finally(() => clearTimeout(t));
    };

    // 1. Preload unmatched Spotify track -> 0ms cache first, else resolve & chain iOS direct audio preload!
    if (
      nextTrack.source === "spotify" &&
      !(nextTrack.streamUrl && nextTrack.resolvedSource)
    ) {
      const cachedNext = getCachedStream(nextTrack.id);
      if (cachedNext) {
        const enriched = {
          ...nextTrack,
          streamUrl: cachedNext.streamUrl,
          resolvedSource: cachedNext.resolvedSource,
        };
        updateTrackInStore(enriched);
        const ytId =
          cachedNext.resolvedSource === "youtube"
            ? cachedNext.youtubeId || extractYouTubeId(cachedNext.streamUrl)
            : null;
        preloadDirectAudioForNext(enriched, ytId);
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
            const ytId =
              data.track.resolvedSource === "youtube"
                ? extractYouTubeId(data.track.streamUrl)
                : null;
            setCachedStream(nextTrack.id, {
              youtubeId: ytId || undefined,
              streamUrl: data.track.streamUrl,
              resolvedSource: data.track.resolvedSource,
            });
            updateTrackInStore(data.track);
            preloadDirectAudioForNext(data.track, ytId);
          }
        })
        .catch(() => {});
      return;
    }

    // 2. Preload SoundCloud progressive MP3 stream (non-iOS) or direct audio-stream (iOS)
    if (
      nextTrack.source === "soundcloud" &&
      !isDirectAudioUrl(nextTrack.streamUrl)
    ) {
      if (isIOS) {
        preloadDirectAudioForNext(nextTrack, null);
        return;
      }
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
            if (
              data.streamUrl &&
              data.streamType === "progressive" &&
              !data.isSnippet
            ) {
              updateTrackInStore({ ...nextTrack, streamUrl: data.streamUrl });
              preloadedTrackRef.current = { id: nextTrack.id, ready: true };
            }
          }
        )
        .catch(() => {});
      return;
    }

    // 3. Preload direct audio-only URL for YouTube / resolved-Spotify next track
    const nextYtId =
      nextTrack.source === "youtube"
        ? extractYouTubeId(nextTrack.sourceUrl)
        : nextTrack.resolvedSource === "youtube" && nextTrack.streamUrl
        ? extractYouTubeId(nextTrack.streamUrl)
        : null;

    if (nextYtId || isIOS) {
      preloadDirectAudioForNext(nextTrack, nextYtId);
    }
  }, [
    upcomingTrack,
    isIOS,
    audioOnlyMode,
    isMobileDevice,
    fetchDirectAudioStreamForTrack,
    updateTrackInStore,
  ]);

  // Progress handler with integrated SponsorBlock, Smart Gapless Preload (3s & 70%) & Smooth Auto-Crossfade
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

      // 2. Instant Next-Track Preload at 3s AND >= 70% / last 15s (so iOS background `onEnded` switches at 0ms!)
      if (
        upcomingTrack &&
        (seconds >= 3 || seconds / dur >= 0.7 || remaining <= 15)
      ) {
        triggerGaplessPreload();
      }

      // 3. Smooth Auto-Next Crossfade (Desktop / Android; skipped on iOS because audio.volume is hardware-controlled)
      if (
        !isIOS &&
        crossfadeDuration > 0 &&
        upcomingTrack &&
        repeatMode !== "one" &&
        remaining > 0.35 &&
        remaining <= crossfadeDuration &&
        autoCrossfadeTriggeredRef.current !== currentTrack.id
      ) {
        autoCrossfadeTriggeredRef.current = currentTrack.id;
        const fadeOutMs = Math.max(
          400,
          Math.min(remaining, crossfadeDuration) * 1000
        );
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
            if (
              usePlayerStore.getState().currentTrack?.id === fadeTargetTrackId
            ) {
              pendingFadeInMsRef.current = Math.min(
                crossfadeDuration * 600,
                1800
              );
              playNext(true);
            }
          },
        });
      }
    },
    [
      isIOS,
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

  // YouTube Clean Audio Stream Fallback (Desktop / Android when embed is blocked 101/150 or stalled > 4s)
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
        const result = await fetchDirectAudioStreamForTrack(
          currentTrack,
          youtubeVideoId
        );
        if (reqId !== playRequestIdRef.current) return;
        if (result?.streamUrl) {
          setCleanAudioOverrides((prev) => ({
            ...prev,
            [trackId]: {
              url: result.streamUrl,
              engine: "html5",
              preservesYouTubeTimeline: result.preservesYouTubeTimeline,
            },
          }));
          setPlaybackError(null);
          showNotice("Đã chuyển sang luồng Audio sạch không quảng cáo");
          return;
        }
      } catch {}

      if (reqId !== playRequestIdRef.current) return;

      if (reason === "embed_blocked") {
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
      fetchDirectAudioStreamForTrack,
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

  // Background-safe `onEnded`: on iOS, immediately assign `audio.src = nextTrackAudioUrl` & `audio.play()`
  // synchronously BEFORE React state commits so iOS NEVER revokes the locked-screen Audio Session!
  const handleEnded = useCallback(() => {
    if (isIOS && upcomingTrack && repeatMode !== "one") {
      const preloadedNextUrl =
        cleanAudioOverrides[upcomingTrack.id]?.url ||
        getCachedDirectAudioUrl(upcomingTrack.id) ||
        (isDirectAudioUrl(upcomingTrack.streamUrl)
          ? upcomingTrack.streamUrl!
          : null);

      if (preloadedNextUrl) {
        html5Ref.current?.switchStreamNow(preloadedNextUrl);
      }
    }
    playNext(true);
  }, [isIOS, upcomingTrack, repeatMode, cleanAudioOverrides, playNext]);

  const handleError = useCallback(
    (msg: string) => {
      setPlaybackError(msg);
    },
    [setPlaybackError]
  );

  const handleHtml5Error = useCallback(() => {
    if (!currentTrack) return;

    // On iOS, if a cached/signed direct audio URL failed/expired, refresh it ONCE from `/api/audio-stream`
    if (isIOS) {
      clearCachedDirectAudioUrl(currentTrack.id);
      if (!iosAudioRetriedRef.current.has(currentTrack.id)) {
        iosAudioRetriedRef.current.add(currentTrack.id);
        setCleanAudioOverrides((prev) => {
          const next = { ...prev };
          delete next[currentTrack.id];
          return next;
        });
        return;
      }
      if (queue.length > 1) {
        showNotice("Luồng âm thanh gặp sự cố — tự động chuyển bài tiếp theo");
        playNext(false);
      } else {
        setPlaybackError("Không thể phát luồng âm thanh nền cho bài hát này.");
      }
      return;
    }

    // Desktop / Android: if a YouTube clean-audio override URL failed/expired, revert cleanly
    if (cleanAudioOverrides[currentTrack.id]) {
      setCleanAudioOverrides((prev) => {
        const next = { ...prev };
        delete next[currentTrack.id];
        return next;
      });
      return;
    }

    if (
      currentTrack.source === "soundcloud" ||
      currentTrack.resolvedSource === "soundcloud"
    ) {
      setScWidgetFallbackIds((prev) => new Set(prev).add(currentTrack.id));
    } else {
      setPlaybackError("Không thể phát luồng âm thanh trực tiếp này.");
    }
  }, [
    isIOS,
    cleanAudioOverrides,
    currentTrack,
    queue.length,
    playNext,
    setPlaybackError,
    showNotice,
  ]);

  return (
    <>
      {!isIOS && (
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
      )}
      <Html5AudioAdapter
        ref={html5Ref}
        streamUrl={html5StreamUrl}
        active={activeEngine === "html5"}
        isPlaying={activeEngine === "html5" && isPlaying}
        volume={outputVolume}
        onProgress={handleProgress}
        onDuration={setDuration}
        onStateChange={handleStateChange}
        onPlaying={handleHtml5Playing}
        onEnded={handleEnded}
        onError={handleHtml5Error}
      />
      {!isIOS && (
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
      )}
    </>
  );
}
