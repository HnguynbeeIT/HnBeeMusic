"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  BookOpen,
  Check,
  Disc3,
  ExternalLink,
  Loader2,
  Play,
  Shuffle,
  UserPlus,
  Users,
} from "lucide-react";
import type {
  ArtistAlbum,
  UnifiedArtistResponse,
} from "@/lib/adapters/artist";
import type {
  ResolveResponse,
  SearchResponse,
  TrackSource,
  UnifiedTrack,
} from "@/lib/audio/types";
import { ARTIST_REGION_META } from "@/lib/audio/region";
import {
  BUTTON_MOTION,
  SOURCE_THEMES,
  SPRING_PHYSICS,
  getSourceTheme,
} from "@/lib/ui/source-theme";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useArtistStore } from "@/store/useArtistStore";
import { getByokHeaders, useSettingsStore } from "@/store/useSettingsStore";
import { TrackRow } from "@/components/track/TrackRow";
import { TrackThumbnail } from "@/components/track/TrackThumbnail";
import { TrackSkeleton } from "@/components/track/TrackSkeleton";
import { SourceBadge } from "@/components/track/SourceBadge";

type FilterValue = "all" | TrackSource;

const ALL_PLATFORMS: readonly TrackSource[] = [
  "spotify",
  "youtube",
  "soundcloud",
  "zingmp3",
  "nhaccuatui",
  "apple_music",
  "audius",
] as const;

const SOURCE_TABS: Array<{ id: FilterValue; label: string; dotClass?: string }> = [
  { id: "all", label: "Tất cả nền tảng" },
  { id: "spotify", label: "Spotify", dotClass: "bg-[#1DB954]" },
  { id: "youtube", label: "YouTube", dotClass: "bg-[#FF0000]" },
  { id: "soundcloud", label: "SoundCloud", dotClass: "bg-[#FF5500]" },
  { id: "zingmp3", label: "Zing MP3", dotClass: "bg-[#8B5CF6]" },
  { id: "nhaccuatui", label: "NhacCuaTui", dotClass: "bg-[#0EA5E9]" },
  { id: "apple_music", label: "Apple Music", dotClass: "bg-[#FA243C]" },
  { id: "audius", label: "Audius", dotClass: "bg-[#CC0FE0]" },
];

const listContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03 } },
};

function formatFollowers(count?: number): string {
  if (!count || count <= 0) return "";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function normalizeTitleForDedup(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function buildFallbackPlatformUrl(
  source: TrackSource,
  artistName: string
): string {
  const encoded = encodeURIComponent(artistName);
  switch (source) {
    case "spotify":
      return `https://open.spotify.com/search/${encoded}`;
    case "youtube":
      return `https://www.youtube.com/results?search_query=${encoded}`;
    case "soundcloud":
      return `https://soundcloud.com/search?q=${encoded}`;
    case "zingmp3":
      return `https://zingmp3.vn/tim-kiem/tat-ca?q=${encoded}`;
    case "nhaccuatui":
      return `https://www.nhaccuatui.com/tim-kiem?q=${encoded}`;
    case "apple_music":
      return `https://music.apple.com/vn/search?term=${encoded}`;
    case "audius":
      return `https://audius.co/search/${encoded}`;
  }
}

interface ArtistPageClientProps {
  artistName: string;
  initialSource?: string;
  artistId?: string;
}

export function ArtistPageClient({
  artistName,
  initialSource,
  artistId,
}: ArtistPageClientProps) {
  const [data, setData] = useState<UnifiedArtistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<FilterValue>("all");
  const [extraTracksBySource, setExtraTracksBySource] = useState<
    Partial<Record<TrackSource, UnifiedTrack[]>>
  >({});
  const [loadingSource, setLoadingSource] = useState<TrackSource | null>(null);
  const [loadingAlbumId, setLoadingAlbumId] = useState<string | null>(null);

  const fetchedSourcesRef = useRef<Set<TrackSource>>(new Set());
  const tracksSectionRef = useRef<HTMLDivElement | null>(null);

  const playTrack = usePlayerStore((s) => s.playTrack);
  const isShuffle = usePlayerStore((s) => s.isShuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);

  const followedArtists = useArtistStore((s) => s.followedArtists);
  const toggleFollowArtist = useArtistStore((s) => s.toggleFollowArtist);
  const byokVersion = useSettingsStore(
    (s) =>
      `${s.youtubeApiKey}:${s.spotifyClientId}:${s.spotifyClientSecret}:${s.soundcloudClientId}`
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setExtraTracksBySource({});
    fetchedSourcesRef.current = new Set();

    const params = new URLSearchParams({ name: artistName, source: "all" });
    if (artistId) params.set("id", artistId);
    if (
      initialSource &&
      ALL_PLATFORMS.includes(initialSource as TrackSource)
    ) {
      params.set("preferredSource", initialSource);
    }

    fetch(`/api/artist?${params.toString()}`, {
      signal: controller.signal,
      headers: getByokHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Không thể tải hồ sơ nghệ sĩ.");
        return res.json();
      })
      .then((json: UnifiedArtistResponse) => {
        setData(json);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Không thể tải dữ liệu nghệ sĩ lúc này.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [artistName, artistId, initialSource, byokVersion]);

  const profile = data?.profile;

  // On-demand adapter query when user selects a platform tab whose tracks are not yet loaded
  useEffect(() => {
    if (!profile || sourceFilter === "all") {
      setLoadingSource(null);
      return;
    }

    const initialMatches = (data?.tracks ?? []).filter(
      (t) => t.source === sourceFilter
    );
    const cachedExtra = extraTracksBySource[sourceFilter];
    if (
      initialMatches.length > 0 ||
      (cachedExtra && cachedExtra.length > 0) ||
      fetchedSourcesRef.current.has(sourceFilter)
    ) {
      setLoadingSource(null);
      return;
    }

    const targetSource = sourceFilter;
    fetchedSourcesRef.current.add(targetSource);
    const controller = new AbortController();
    setLoadingSource(targetSource);

    const params = new URLSearchParams({
      q: profile.name,
      source: targetSource,
      region: profile.region || "VN",
    });

    fetch(`/api/search?${params.toString()}`, {
      signal: controller.signal,
      headers: getByokHeaders(),
    })
      .then((res) => res.json())
      .then((res: SearchResponse) => {
        const fetched = (res.tracks ?? []).filter(
          (t) => t.source === targetSource
        );
        if (fetched.length > 0) {
          setExtraTracksBySource((prev) => ({
            ...prev,
            [targetSource]: fetched,
          }));
          return;
        }
        // If keyword search returned empty for extended VN/global provider, load default provider feed
        if (
          targetSource === "zingmp3" ||
          targetSource === "nhaccuatui" ||
          targetSource === "apple_music" ||
          targetSource === "audius"
        ) {
          return fetch(`/api/search?source=${targetSource}&region=${profile.region || "VN"}`, {
            signal: controller.signal,
            headers: getByokHeaders(),
          })
            .then((r) => r.json())
            .then((fallbackRes: SearchResponse) => {
              const list = (fallbackRes.tracks ?? []).filter(
                (t) => t.source === targetSource
              );
              setExtraTracksBySource((prev) => ({
                ...prev,
                [targetSource]: list,
              }));
            });
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSource(null);
      });

    return () => controller.abort();
  }, [profile, data?.tracks, sourceFilter, extraTracksBySource]);

  const combinedTracks = useMemo<UnifiedTrack[]>(() => {
    const base = data?.tracks ?? [];
    const extras = Object.values(extraTracksBySource).flatMap(
      (list) => list ?? []
    );
    if (extras.length === 0) return base;
    const seenIds = new Set(base.map((t) => t.id));
    const merged = [...base];
    for (const item of extras) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        merged.push(item);
      }
    }
    return merged;
  }, [data?.tracks, extraTracksBySource]);

  const displayedTracks = useMemo<UnifiedTrack[]>(() => {
    if (combinedTracks.length === 0) return [];
    if (sourceFilter !== "all") {
      return combinedTracks.filter((t) => t.source === sourceFilter);
    }
    const seen = new Set<string>();
    const result: UnifiedTrack[] = [];
    for (const track of combinedTracks) {
      const key = normalizeTitleForDedup(track.title);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      result.push(track);
    }
    return result;
  }, [combinedTracks, sourceFilter]);

  const displayedAlbums = useMemo<ArtistAlbum[]>(() => {
    if (!data?.albums) return [];
    if (sourceFilter === "all") return data.albums;
    return data.albums.filter((a) => a.source === sourceFilter);
  }, [data, sourceFilter]);

  const activePlatformBadges = useMemo<TrackSource[]>(() => {
    const set = new Set<TrackSource>(profile?.sourcesFound ?? []);
    for (const src of Object.keys(extraTracksBySource) as TrackSource[]) {
      if ((extraTracksBySource[src]?.length ?? 0) > 0) set.add(src);
    }
    return ALL_PLATFORMS.filter((src) => set.has(src));
  }, [profile?.sourcesFound, extraTracksBySource]);

  const externalPlatformLinks = useMemo(() => {
    if (!profile) return [];
    return ALL_PLATFORMS.map((src) => ({
      source: src,
      label: SOURCE_THEMES[src].label,
      dotHex: SOURCE_THEMES[src].hex,
      url:
        profile.externalUrls[src] ||
        buildFallbackPlatformUrl(src, profile.name),
    }));
  }, [profile]);

  const theme = getSourceTheme(profile?.primarySource);

  const isFollowing = useMemo(() => {
    if (!profile) return false;
    const normName = profile.name.trim().toLowerCase();
    return followedArtists.some(
      (a) => a.id === profile.id || a.name.trim().toLowerCase() === normName
    );
  }, [followedArtists, profile]);

  const handleSelectPlatformBadge = (src: TrackSource) => {
    setSourceFilter(src);
    tracksSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handlePlayAll = () => {
    if (displayedTracks.length > 0) {
      playTrack(displayedTracks[0], displayedTracks);
    }
  };

  const handleShufflePlay = () => {
    if (displayedTracks.length === 0) return;
    if (!isShuffle) toggleShuffle();
    const random =
      displayedTracks[Math.floor(Math.random() * displayedTracks.length)];
    playTrack(random, displayedTracks);
  };

  const handlePlayAlbum = async (album: ArtistAlbum) => {
    if (loadingAlbumId) return;
    setLoadingAlbumId(album.id);
    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getByokHeaders(),
        },
        body: JSON.stringify({ url: album.sourceUrl }),
      });
      const resolved = (await res.json()) as ResolveResponse;
      if (res.ok && resolved.tracks?.length > 0) {
        playTrack(resolved.tracks[0], resolved.tracks);
      } else {
        window.open(album.sourceUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      window.open(album.sourceUrl, "_blank", "noopener,noreferrer");
    } finally {
      setLoadingAlbumId(null);
    }
  };

  if (loading) {
    return (
      <div className="w-full min-w-0 space-y-8">
        <div className="h-56 animate-pulse rounded-3xl border border-white/10 bg-zinc-900/60" />
        <TrackSkeleton count={6} />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="rounded-3xl border border-white/10 bg-zinc-900/60 p-10 text-center backdrop-blur-xl">
        <p className="text-sm font-medium text-zinc-200">
          {error || "Không tìm thấy thông tin nghệ sĩ."}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-8 overflow-x-hidden">
      {/* ARTIST HERO BANNER */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/60 p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl sm:p-8">
        {(profile.banner || profile.avatar) && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center opacity-25 blur-[90px] transition-all duration-1000"
            style={{
              backgroundImage: `url(${profile.banner || profile.avatar})`,
            }}
          />
        )}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-[#0B0D12]/90 via-zinc-950/40 to-transparent"
        />

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end">
          <div
            style={{ boxShadow: theme.glowShadow }}
            className="shrink-0 self-start rounded-full ring-2 ring-white/15"
          >
            <TrackThumbnail
              src={profile.avatar}
              alt={profile.name}
              className="h-32 w-32 rounded-full sm:h-40 sm:w-40"
            />
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            {/* Verified + Region + Interactive Platform Badges */}
            <div className="flex flex-wrap items-center gap-2">
              {profile.verified && (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-300">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Nghệ sĩ xác thực
                </span>
              )}
              {profile.region && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-zinc-200">
                  <span>{ARTIST_REGION_META[profile.region]?.flag}</span>
                  <span>
                    {ARTIST_REGION_META[profile.region]?.shortLabel} &bull;{" "}
                    {profile.language}
                  </span>
                </span>
              )}
              {activePlatformBadges.map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => handleSelectPlatformBadge(src)}
                  className="rounded-full transition-transform hover:scale-105 focus:outline-none"
                  title={`Lọc bài hát từ ${SOURCE_THEMES[src].label}`}
                >
                  <SourceBadge source={src} />
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {profile.name}
              </h1>
              {profile.verified && (
                <BadgeCheck
                  aria-label="Nghệ sĩ đã xác minh"
                  className="h-6 w-6 shrink-0 text-sky-400"
                />
              )}
            </div>

            {profile.bio && (
              <p className="max-w-2xl text-sm leading-relaxed text-zinc-300">
                {profile.bio}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
              {profile.followers && profile.followers > 0 && (
                <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-zinc-200">
                  <Users className="h-3.5 w-3.5 text-zinc-400" />
                  {formatFollowers(profile.followers)} người theo dõi
                </span>
              )}

              {profile.genres.map((genre) => (
                <span
                  key={genre}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] capitalize text-zinc-300"
                >
                  {genre}
                </span>
              ))}
            </div>

            {/* ACTION BAR: Play All, Shuffle, Follow, Wiki */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={handlePlayAll}
                disabled={displayedTracks.length === 0}
                style={{ boxShadow: theme.glowShadow }}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 shadow-xl disabled:opacity-40"
              >
                <Play className="h-4 w-4 fill-zinc-950" />
                Phát tất cả ({displayedTracks.length})
              </motion.button>

              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={handleShufflePlay}
                disabled={displayedTracks.length === 0}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-medium text-white backdrop-blur-md hover:bg-white/15 disabled:opacity-40"
              >
                <Shuffle className="h-3.5 w-3.5" />
                Trộn bài
              </motion.button>

              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={() =>
                  toggleFollowArtist({
                    id: profile.id,
                    name: profile.name,
                    avatar: profile.avatar,
                    primarySource: profile.primarySource,
                  })
                }
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-xs font-semibold transition-colors ${
                  isFollowing
                    ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-300"
                    : "border-white/15 bg-black/35 text-zinc-200 hover:bg-white/10"
                }`}
              >
                {isFollowing ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Đang theo dõi
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" />
                    Theo dõi
                  </>
                )}
              </motion.button>

              {profile.wikiUrl && (
                <a
                  href={profile.wikiUrl.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-300 transition-colors hover:bg-amber-500/20 hover:text-amber-200"
                >
                  <BookOpen className="h-3 w-3" />
                  {profile.wikiUrl.label}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {/* EXTERNAL PLATFORM LINKS (All 7 Platforms) */}
            <div className="no-scrollbar flex max-w-full items-center gap-1.5 overflow-x-auto pt-1 sm:flex-wrap sm:overflow-visible">
              {externalPlatformLinks.map((item) => (
                <a
                  key={item.source}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: item.dotHex }}
                  />
                  <span>{item.label}</span>
                  <ExternalLink className="h-3 w-3 text-zinc-500" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SOURCE FILTER TABS FOR POPULAR TRACKS (All 7 Platforms) */}
      <div
        ref={tracksSectionRef}
        className="flex w-full min-w-0 flex-col gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">Bài hát phổ biến</h2>
          <span className="text-xs text-zinc-400">
            {displayedTracks.length} bài hát
          </span>
        </div>

        <div className="w-full min-w-0">
          <div
            role="tablist"
            aria-label="Lọc bài hát nghệ sĩ theo nền tảng"
            className="no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-zinc-900/60 p-1 backdrop-blur-xl"
          >
            {SOURCE_TABS.map((tab) => {
              const active = sourceFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSourceFilter(tab.id)}
                  className={`relative flex shrink-0 select-none items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium caret-transparent transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30 ${
                    active ? "text-white" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="artistSourceTab"
                      transition={SPRING_PHYSICS}
                      className="absolute inset-0 z-0 rounded-full border border-white/20 bg-white/15 shadow-sm"
                    />
                  )}
                  {tab.dotClass && (
                    <span
                      className={`relative z-10 h-1.5 w-1.5 rounded-full ${tab.dotClass}`}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* POPULAR TRACKS LIST */}
      {sourceFilter !== "all" && loadingSource === sourceFilter ? (
        <TrackSkeleton count={5} />
      ) : displayedTracks.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-8 text-center text-xs text-zinc-400 backdrop-blur-xl">
          Chưa tìm thấy bài hát phù hợp của{" "}
          <strong className="text-white">{profile.name}</strong> trên{" "}
          <strong className="text-white">
            {sourceFilter === "all"
              ? "các nền tảng"
              : SOURCE_THEMES[sourceFilter].label}
          </strong>
          . Hãy thử chọn &ldquo;Tất cả nền tảng&rdquo;.
        </div>
      ) : (
        <motion.div
          key={sourceFilter}
          variants={listContainerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-1 rounded-2xl border border-white/10 bg-zinc-900/40 p-2 backdrop-blur-xl"
        >
          {displayedTracks.map((track, idx) => (
            <TrackRow
              key={track.id}
              track={track}
              index={idx}
              contextQueue={displayedTracks}
            />
          ))}
        </motion.div>
      )}

      {/* ALBUMS & RELEASES CARD GRID */}
      {displayedAlbums.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Disc3 className="h-4 w-4 text-zinc-400" />
            <h2 className="text-lg font-semibold text-white">
              Album &amp; Tuyển tập ({displayedAlbums.length})
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {displayedAlbums.map((album) => {
              const isLoadingAlbum = loadingAlbumId === album.id;
              return (
                <div
                  key={album.id}
                  onClick={() => void handlePlayAlbum(album)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      void handlePlayAlbum(album);
                    }
                  }}
                  className="group cursor-pointer rounded-2xl border border-white/10 bg-zinc-900/60 p-3.5 shadow-xl backdrop-blur-xl transition-colors hover:bg-zinc-900/90"
                >
                  <div className="relative mb-3 overflow-hidden rounded-xl">
                    <TrackThumbnail
                      src={album.thumbnail}
                      alt={album.title}
                      className="aspect-square w-full rounded-xl transition-transform duration-500 group-hover:scale-105"
                    />
                    <motion.div
                      {...BUTTON_MOTION}
                      className="absolute bottom-2.5 right-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-950 shadow-xl opacity-90 group-hover:opacity-100"
                    >
                      {isLoadingAlbum ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 translate-x-[1px] fill-zinc-950" />
                      )}
                    </motion.div>
                  </div>

                  <p className="truncate text-sm font-semibold text-white">
                    {album.title}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                    <span className="truncate capitalize">
                      {album.releaseYear ? `${album.releaseYear} · ` : ""}
                      {album.type}
                    </span>
                    <SourceBadge source={album.source} compact />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
