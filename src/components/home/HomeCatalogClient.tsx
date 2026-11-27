"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  BadgeCheck,
  Disc3,
  Heart,
  Link2,
  ListPlus,
  Pause,
  Play,
  Search,
  Shuffle,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type {
  ArtistSearchItem,
  SearchResponse,
  TrackSource,
  UnifiedTrack,
} from "@/lib/audio/types";
import type { CuratedPlaylist } from "@/lib/adapters/fallback-catalog";
import { ARTIST_REGION_META, type ArtistRegion } from "@/lib/audio/region";
import { DIRECTORY_ARTISTS } from "@/config/verified-artists";
import { useRegion } from "@/context/RegionContext";
import { RegionSelector } from "@/components/layout/RegionSelector";
import { ArtistCard } from "@/components/artist/ArtistCard";
import { buildArtistHref } from "@/components/artist/ArtistLink";
import {
  BUTTON_MOTION,
  SPRING_PHYSICS,
  getSourceTheme,
} from "@/lib/ui/source-theme";
import { useDebounce } from "@/hooks/useDebounce";
import { usePlayerStore } from "@/store/usePlayerStore";
import { usePlaylistStore } from "@/store/usePlaylistStore";
import { useAuthStore } from "@/store/useAuthStore";
import { getByokHeaders, useSettingsStore } from "@/store/useSettingsStore";
import { UrlResolverBar } from "@/components/search/UrlResolverBar";
import { TrackRow } from "@/components/track/TrackRow";
import { TrackThumbnail } from "@/components/track/TrackThumbnail";
import { TrackSkeleton } from "@/components/track/TrackSkeleton";
import { SourceBadge } from "@/components/track/SourceBadge";
import { ArtistLink } from "@/components/artist/ArtistLink";
import { PlaylistCover } from "@/components/playlist/PlaylistCover";
import { AudioEqualizer } from "@/components/track/AudioEqualizer";

type FilterValue = "all" | TrackSource;

const FILTER_TABS: Array<{ id: FilterValue; label: string; dotClass?: string }> = [
  { id: "all", label: "Tất cả" },
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
  visible: {
    transition: {
      staggerChildren: 0.03,
    },
  },
};

const ARTIST_REGION_TABS: Array<{
  id: ArtistRegion | "ALL";
  flag: string;
  label: string;
  language: string;
}> = [
  { id: "VN", flag: "🇻🇳", label: "Việt Nam", language: "Tiếng Việt" },
  { id: "US", flag: "🇺🇸🇬🇧", label: "US-UK", language: "English" },
  { id: "KR", flag: "🇰🇷", label: "Hàn Quốc", language: "한국어" },
  { id: "JP", flag: "🇯🇵", label: "Nhật Bản", language: "日本語" },
  { id: "ALL", flag: "🌍", label: "Tất cả", language: "Đa khu vực" },
];

function getTimeGreeting(hour: number): string {
  if (hour >= 5 && hour < 11) return "Chào buổi sáng";
  if (hour >= 11 && hour < 14) return "Chào buổi trưa";
  if (hour >= 14 && hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

export function HomeCatalogClient({
  tracks,
  curatedPlaylists,
}: {
  tracks: UnifiedTrack[];
  curatedPlaylists: CuratedPlaylist[];
}) {
  const { region } = useRegion();
  const [greeting, setGreeting] = useState("Chào mừng trở lại");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [resultType, setResultType] = useState<"all" | "tracks" | "artists">("all");
  const [artistTab, setArtistTab] = useState<ArtistRegion | "ALL">("VN");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [liveResults, setLiveResults] = useState<UnifiedTrack[] | null>(null);
  const [liveArtists, setLiveArtists] = useState<ArtistSearchItem[]>([]);
  const [searching, setSearching] = useState(false);

  // SSR-safe real-time greeting
  useEffect(() => {
    setGreeting(getTimeGreeting(new Date().getHours()));
  }, []);

  // Sync artist directory tab when user switches global region selector
  useEffect(() => {
    setArtistTab(region);
  }, [region]);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isShuffle = usePlayerStore((s) => s.isShuffle);
  const likedTracks = usePlayerStore((s) => s.likedTracks);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);

  const userPlaylists = usePlaylistStore((s) => s.playlists);
  const user = useAuthStore((s) => s.user);
  const byokVersion = useSettingsStore(
    (s) =>
      `${s.youtubeApiKey}:${s.spotifyClientId}:${s.spotifyClientSecret}:${s.soundcloudClientId}`
  );

  const debouncedQuery = useDebounce(searchQuery, 400);
  const isSearchActive = debouncedQuery.trim().length > 0;
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Live Multi-Source Search against GET /api/search with 400ms debounce
  useEffect(() => {
    if (!isSearchActive) {
      setLiveResults(null);
      setLiveArtists([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);

    const params = new URLSearchParams({
      q: debouncedQuery.trim(),
      source: filter,
      region,
    });

    fetch(`/api/search?${params.toString()}`, {
      signal: controller.signal,
      headers: getByokHeaders(),
    })
      .then((res) => res.json())
      .then((data: SearchResponse) => {
        setLiveResults(data.tracks ?? []);
        setLiveArtists(data.artists ?? []);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLiveResults([]);
        setLiveArtists([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, filter, region, isSearchActive, byokVersion]);

  const displayedTracks = useMemo(() => {
    if (isSearchActive) return liveResults ?? [];
    if (filter === "all") return tracks;
    return tracks.filter((t) => t.source === filter);
  }, [tracks, filter, isSearchActive, liveResults]);

  const heroTrack = currentTrack ?? tracks[0];
  const heroTheme = getSourceTheme(heroTrack?.source);
  const isHeroPlaying =
    Boolean(heroTrack) && currentTrack?.id === heroTrack.id && isPlaying;

  const safeUserPlaylists = useMemo(
    () => (Array.isArray(userPlaylists) ? userPlaylists : []),
    [userPlaylists]
  );

  const handlePlayAll = () => {
    if (displayedTracks.length > 0) {
      playTrack(displayedTracks[0], displayedTracks);
    }
  };

  const handleShufflePlay = () => {
    if (displayedTracks.length === 0) return;
    if (!isShuffle) toggleShuffle();
    const randomTrack =
      displayedTracks[Math.floor(Math.random() * displayedTracks.length)];
    playTrack(randomTrack, displayedTracks);
  };

  const handlePlayCurated = (pl: CuratedPlaylist) => {
    const plTracks = pl.trackIds
      .map((id) => tracks.find((t) => t.id === id))
      .filter((t): t is UnifiedTrack => Boolean(t));
    if (plTracks.length > 0) {
      playTrack(plTracks[0], plTracks);
    }
  };

  const focusImportUrlBar = () => {
    const input = document.getElementById(
      "hnbee-import-url-input"
    ) as HTMLInputElement | null;
    if (input) {
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus();
    }
  };

  const filteredArtists = useMemo(
    () =>
      DIRECTORY_ARTISTS.filter((a) =>
        artistTab === "ALL" ? true : a.region === artistTab
      ),
    [artistTab]
  );

  // Fill Quick Access Grid up to 6 sleek tiles (Liked + Quick Import + User Playlists + Curated Playlists)
  const quickPlaylists = useMemo(() => {
    const personal = safeUserPlaylists.slice(0, 3).map((pl) => ({
      kind: "personal" as const,
      id: pl.id,
      name: pl.name,
      subtitle: `${pl.tracks?.length || 0} bài · Cá nhân`,
      coverUrl: pl.coverUrl,
      tracks: Array.isArray(pl.tracks) ? pl.tracks : [],
      href: `/library/playlist/${encodeURIComponent(pl.id)}`,
    }));

    const remainingSlots = Math.max(0, 4 - personal.length);
    const curated = curatedPlaylists.slice(0, remainingSlots).map((pl) => ({
      kind: "curated" as const,
      id: pl.id,
      name: pl.name,
      subtitle: pl.subtitle,
      coverUrl: pl.thumbnail,
      curatedRef: pl,
    }));

    return [...personal, ...curated];
  }, [safeUserPlaylists, curatedPlaylists]);

  return (
    <div className="w-full min-w-0 space-y-7 overflow-x-hidden sm:space-y-8">
      {/* 1. REAL-TIME GREETING + QUICK ACCESS GRID (2 cols Mobile / 3 cols Desktop) */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
              HnBee Music • Multi-Source
            </p>
            <h1 className="truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {greeting}
              {user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}
            </h1>
          </div>
          <div className="hidden sm:block">
            <RegionSelector />
          </div>
        </div>

        {/* Quick Access Grid */}
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3">
          {/* Tile 1: Liked Songs */}
          <div
            onClick={() =>
              likedTracks.length > 0 && playTrack(likedTracks[0], likedTracks)
            }
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && likedTracks.length > 0) {
                e.preventDefault();
                playTrack(likedTracks[0], likedTracks);
              }
            }}
            className="group relative flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/65 pr-2.5 shadow-lg backdrop-blur-xl transition-colors hover:border-emerald-400/30 hover:bg-zinc-900/90"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 text-zinc-950 shadow-inner">
              <Heart className="h-6 w-6 fill-current" />
            </div>
            <div className="min-w-0 flex-1 py-2">
              <p className="truncate text-xs font-bold text-white sm:text-sm">
                Bài hát đã thích
              </p>
              <p className="truncate text-[11px] text-zinc-400">
                {likedTracks.length} bài hát
              </p>
            </div>
            {likedTracks.length > 0 && (
              <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-zinc-950 opacity-0 shadow-md transition-opacity group-hover:opacity-100 sm:flex">
                <Play className="h-3.5 w-3.5 translate-x-[1px] fill-current" />
              </span>
            )}
          </div>

          {/* Tile 2: Quick Paste Playlist Link */}
          <button
            type="button"
            onClick={focusImportUrlBar}
            className="group relative flex items-center gap-2.5 overflow-hidden rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.08] pr-2.5 text-left shadow-lg backdrop-blur-xl transition-colors hover:border-emerald-400/40 hover:bg-emerald-500/15"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center bg-emerald-500/20 text-emerald-300">
              <Link2 className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1 py-2">
              <p className="truncate text-xs font-bold text-emerald-200 sm:text-sm">
                Dán link Playlist
              </p>
              <p className="truncate text-[11px] text-emerald-300/75">
                Spotify · YT · SC
              </p>
            </div>
          </button>

          {/* Tiles 3..6: Recent Personal & Curated Playlists */}
          {quickPlaylists.map((item) =>
            item.kind === "personal" ? (
              <div
                key={item.id}
                className="group relative flex items-center gap-2.5 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/65 pr-2.5 shadow-lg backdrop-blur-xl transition-colors hover:border-white/20 hover:bg-zinc-900/90"
              >
                <Link
                  href={item.href}
                  className="flex min-w-0 flex-1 items-center gap-2.5"
                >
                  <PlaylistCover
                    name={item.name}
                    coverUrl={item.coverUrl}
                    tracks={item.tracks}
                    className="h-14 w-14 shrink-0 rounded-none"
                  />
                  <div className="min-w-0 flex-1 py-2">
                    <p className="truncate text-xs font-semibold text-white group-hover:text-emerald-300 sm:text-sm">
                      {item.name}
                    </p>
                    <p className="truncate text-[11px] text-zinc-400">
                      {item.subtitle}
                    </p>
                  </div>
                </Link>
                {item.tracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => playTrack(item.tracks[0], item.tracks)}
                    aria-label={`Phát ${item.name}`}
                    className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-zinc-950 opacity-0 shadow-md transition-opacity hover:bg-emerald-400 group-hover:opacity-100 sm:flex"
                  >
                    <Play className="h-3.5 w-3.5 translate-x-[1px] fill-current" />
                  </button>
                )}
              </div>
            ) : (
              <button
                key={item.id}
                type="button"
                onClick={() => handlePlayCurated(item.curatedRef)}
                className="group relative flex items-center gap-2.5 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/65 pr-2.5 text-left shadow-lg backdrop-blur-xl transition-colors hover:border-white/20 hover:bg-zinc-900/90"
              >
                <TrackThumbnail
                  src={item.coverUrl}
                  alt={item.name}
                  className="h-14 w-14 shrink-0 rounded-none"
                />
                <div className="min-w-0 flex-1 py-2">
                  <p className="truncate text-xs font-semibold text-white sm:text-sm">
                    {item.name}
                  </p>
                  <p className="truncate text-[11px] text-zinc-400">
                    {item.subtitle}
                  </p>
                </div>
                <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-zinc-950 opacity-0 shadow-md transition-opacity group-hover:opacity-100 sm:flex">
                  <Play className="h-3.5 w-3.5 translate-x-[1px] fill-current" />
                </span>
              </button>
            )
          )}
        </div>

        {/* Sleek Smart URL Resolver Bar (Spotify / YouTube / SoundCloud) */}
        <UrlResolverBar />
      </section>

      {/* 2. FEATURED SPOTLIGHT HERO BANNER (Dynamic Cover Ambient Glow) */}
      {heroTrack && (
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/65 p-5 shadow-2xl shadow-black/70 backdrop-blur-2xl sm:p-8">
          {/* Dynamic Cover-Derived Ambient Glow */}
          {heroTrack.thumbnail && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 scale-125 bg-cover bg-center opacity-25 blur-[95px] transition-all duration-1000"
              style={{ backgroundImage: `url(${heroTrack.thumbnail})` }}
            />
          )}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-20 -z-10 h-72 w-72 rounded-full opacity-35 blur-[100px] transition-all duration-1000"
            style={{ background: heroTheme.ambientRadial }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-[#09090b]/85 via-[#09090b]/60 to-transparent"
          />

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
            <motion.div
              animate={{ scale: isHeroPlaying ? 1.04 : 1 }}
              transition={SPRING_PHYSICS}
              style={{
                boxShadow: isHeroPlaying ? heroTheme.glowShadow : undefined,
              }}
              className="relative shrink-0 self-start rounded-2xl shadow-2xl shadow-black/80"
            >
              <TrackThumbnail
                src={heroTrack.thumbnail}
                alt={heroTrack.title}
                className="h-32 w-32 rounded-2xl ring-1 ring-white/15 sm:h-44 sm:w-44"
              />
              {isHeroPlaying && (
                <div className="absolute bottom-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 backdrop-blur-md">
                  <AudioEqualizer
                    playing={true}
                    source={heroTrack.source}
                    className="h-3.5 w-3.5"
                  />
                </div>
              )}
            </motion.div>

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-0.5 text-[11px] font-semibold text-zinc-100 backdrop-blur-md">
                  <Sparkles className="h-3 w-3 text-amber-400" />
                  {currentTrack ? "Đang phát nổi bật" : "Featured Spotlight"}
                </span>
                <SourceBadge
                  source={heroTrack.source}
                  resolvedSource={heroTrack.resolvedSource}
                />
              </div>

              <div>
                <h2 className="line-clamp-2 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                  {heroTrack.title}
                </h2>
                <div className="mt-1">
                  <ArtistLink
                    name={heroTrack.artist}
                    source={heroTrack.source}
                    className="text-sm font-medium text-zinc-300"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <motion.button
                  type="button"
                  {...BUTTON_MOTION}
                  onClick={() => playTrack(heroTrack, tracks)}
                  style={{ boxShadow: heroTheme.glowShadow }}
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-zinc-950 shadow-xl hover:bg-zinc-100"
                  aria-label={isHeroPlaying ? "Tạm dừng" : "Phát ngay"}
                >
                  {isHeroPlaying ? (
                    <>
                      <Pause className="h-4 w-4 fill-zinc-950" />
                      <span>Tạm dừng</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 translate-x-[1px] fill-zinc-950" />
                      <span>Phát ngay</span>
                    </>
                  )}
                </motion.button>

                <motion.button
                  type="button"
                  {...BUTTON_MOTION}
                  onClick={handleShufflePlay}
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 text-sm font-semibold text-white backdrop-blur-md hover:bg-white/20"
                >
                  <Shuffle className="h-4 w-4" />
                  <span>Trộn bài</span>
                </motion.button>

                <motion.button
                  type="button"
                  {...BUTTON_MOTION}
                  onClick={handlePlayAll}
                  className="hidden h-12 items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-4 text-xs font-semibold text-zinc-200 hover:bg-white/10 hover:text-white sm:inline-flex"
                >
                  <Disc3 className="h-4 w-4 text-emerald-400" />
                  Phát tất cả ({displayedTracks.length})
                </motion.button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 3. HORIZONTAL CAROUSEL 1: GỢI Ý HÔM NAY (TODAY'S PICKS) */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">
              Gợi ý hôm nay
            </h2>
            <p className="text-xs text-zinc-400">
              Những bản phối chọn lọc chất lượng cao từ Spotify, YouTube &amp; SoundCloud
            </p>
          </div>
          <Link
            href="/trending"
            className="shrink-0 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
          >
            Xem Trending →
          </Link>
        </div>

        <div className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
          {tracks.slice(0, 8).map((track) => {
            const isCurrent = currentTrack?.id === track.id;
            const isActivePlaying = isCurrent && isPlaying;
            const tTheme = getSourceTheme(track.source);
            return (
              <div
                key={`pick-${track.id}`}
                onClick={() => playTrack(track, tracks)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    playTrack(track, tracks);
                  }
                }}
                className={`group relative w-40 shrink-0 cursor-pointer snap-start rounded-2xl border p-3 transition-all duration-300 sm:w-44 ${
                  isCurrent
                    ? "border-white/25 bg-white/10 shadow-xl"
                    : "border-white/10 bg-zinc-900/55 hover:border-white/20 hover:bg-zinc-900/85"
                }`}
              >
                <div className="relative mb-3 overflow-hidden rounded-xl">
                  <TrackThumbnail
                    src={track.thumbnail}
                    alt={track.title}
                    className="aspect-square w-full rounded-xl transition-transform duration-500 group-hover:scale-105"
                  />
                  <span
                    className={`absolute left-2 top-2 rounded-full border border-black/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur-md ${tTheme.barClass}`}
                  >
                    {tTheme.shortLabel}
                  </span>
                  <div
                    className={`absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-950 shadow-xl transition-all duration-200 ${
                      isActivePlaying
                        ? "translate-y-0 opacity-100"
                        : "translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"
                    }`}
                  >
                    {isActivePlaying ? (
                      <Pause className="h-4 w-4 fill-zinc-950" />
                    ) : (
                      <Play className="h-4 w-4 translate-x-[1px] fill-zinc-950" />
                    )}
                  </div>
                </div>
                <p
                  className={`truncate text-xs font-bold ${
                    isCurrent ? tTheme.textClass : "text-white"
                  }`}
                >
                  {track.title}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                  {track.artist}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. HORIZONTAL CAROUSEL 2: NGHỆ SĨ NỔI BẬT (BY REGION & LANGUAGE) */}
      <section className="space-y-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">
              Nghệ sĩ nổi bật
            </h2>
            <p className="text-xs text-zinc-400">
              {ARTIST_REGION_TABS.find((t) => t.id === artistTab)?.flag}{" "}
              {ARTIST_REGION_TABS.find((t) => t.id === artistTab)?.label} &bull;{" "}
              {ARTIST_REGION_TABS.find((t) => t.id === artistTab)?.language}
            </p>
          </div>

          <div className="no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-zinc-900/60 p-1 backdrop-blur-xl">
            {ARTIST_REGION_TABS.map((tab) => {
              const active = artistTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setArtistTab(tab.id)}
                  className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    active ? "text-white" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="artistDirectoryRegionTab"
                      transition={SPRING_PHYSICS}
                      className="absolute inset-0 -z-10 rounded-full border border-white/15 bg-white/15"
                    />
                  )}
                  <span>{tab.flag}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
          {filteredArtists.map((artist) => {
            const href = `/artist/${encodeURIComponent(artist.name)}?source=spotify${
              artist.spotifyId ? `&artistId=${artist.spotifyId}` : ""
            }`;
            return (
              <Link
                key={artist.id}
                href={href}
                className="group relative flex w-40 shrink-0 snap-start flex-col items-center overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/60 p-4 text-center shadow-xl backdrop-blur-xl transition-all hover:border-white/25 hover:bg-zinc-900/90 sm:w-44"
              >
                <div className="relative mb-3">
                  <TrackThumbnail
                    src={artist.avatar}
                    alt={artist.name}
                    className="h-24 w-24 rounded-full ring-2 ring-white/15 transition-transform duration-300 group-hover:scale-105"
                  />
                  {artist.verified && (
                    <span className="absolute bottom-0.5 right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-950 ring-2 ring-zinc-950">
                      <BadgeCheck className="h-4 w-4 text-sky-400" />
                    </span>
                  )}
                </div>
                <p className="w-full truncate text-sm font-bold text-white group-hover:text-emerald-300">
                  {artist.name}
                </p>
                <p className="mt-0.5 w-full truncate text-[11px] text-zinc-400">
                  {artist.subtitle}
                </p>
                <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-zinc-500 group-hover:text-zinc-300">
                  {artist.language}
                  <ArrowUpRight className="h-3 w-3" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 5. MULTI-SOURCE SHOWCASE (SPOTIFY • YOUTUBE • SOUNDCLOUD) + LIVE SEARCH */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white">
                Tuyển chọn đa nền tảng
              </h2>
              <p className="text-xs text-zinc-400">
                Spotify &bull; YouTube &bull; SoundCloud &bull; Zing MP3 &bull; NhacCuaTui &bull; Apple Music &bull; Audius
              </p>
            </div>
            <button
              type="button"
              onClick={focusImportUrlBar}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
            >
              <ListPlus className="h-3.5 w-3.5" />
              Import URL
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Live Debounced Search Input */}
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchFocused(true);
                  }}
                  placeholder="Tìm bài hát, nghệ sĩ..."
                  className="w-full rounded-full border border-white/10 bg-zinc-900/60 py-2.5 pl-10 pr-9 text-xs text-white placeholder:text-zinc-500 backdrop-blur-xl focus:border-white/25 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Xóa tìm kiếm"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-500 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Instant Search Artist Dropdown (Top 3) */}
                <AnimatePresence>
                  {searchFocused &&
                    searchQuery.trim().length >= 2 &&
                    liveArtists.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={SPRING_PHYSICS}
                        className="absolute inset-x-0 top-12 z-40 overflow-hidden rounded-2xl border border-white/15 bg-zinc-900/95 p-1.5 shadow-2xl shadow-black/70 backdrop-blur-2xl"
                      >
                        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Gợi ý Nghệ sĩ
                        </p>
                        {liveArtists.slice(0, 3).map((artist) => {
                          const reg = ARTIST_REGION_META[artist.region];
                          return (
                            <Link
                              key={artist.id}
                              href={buildArtistHref(
                                artist.name,
                                artist.source,
                                artist.artistId
                              )}
                              className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/10"
                            >
                              <TrackThumbnail
                                src={artist.avatar}
                                alt={artist.name}
                                className="h-8 w-8 rounded-full"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  <span className="truncate text-xs font-semibold text-white">
                                    {artist.name}
                                  </span>
                                  {artist.verified && (
                                    <BadgeCheck className="h-3 w-3 shrink-0 text-sky-400" />
                                  )}
                                </div>
                                <p className="truncate text-[10px] text-zinc-400">
                                  {reg.flag} {reg.shortLabel} &bull;{" "}
                                  {artist.language}
                                </p>
                              </div>
                            </Link>
                          );
                        })}
                      </motion.div>
                    )}
                </AnimatePresence>
              </div>
            </div>

            {/* Source Filter Pills (portrait-safe horizontal scroll without scrollbar) */}
            <div className="no-scrollbar inline-flex max-w-full items-center gap-1 self-start overflow-x-auto rounded-full border border-white/10 bg-zinc-900/60 p-1 backdrop-blur-xl sm:self-auto">
              {FILTER_TABS.map((tab) => {
                const active = filter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilter(tab.id)}
                    className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                      active ? "text-white" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="activeSourceTab"
                        transition={SPRING_PHYSICS}
                        className="absolute inset-0 -z-10 rounded-full border border-white/15 bg-white/15 shadow-sm"
                      />
                    )}
                    {tab.dotClass && (
                      <span className={`h-1.5 w-1.5 rounded-full ${tab.dotClass}`} />
                    )}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Result Type Tabs when searching */}
        {isSearchActive && (
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: "all", label: "Tất cả" },
                { id: "tracks", label: "Bài hát" },
                { id: "artists", label: `Nghệ sĩ (${liveArtists.length})` },
              ] as const
            ).map((t) => {
              const active = resultType === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setResultType(t.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-white text-zinc-950"
                      : "border border-white/10 bg-zinc-900/60 text-zinc-400 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Skeleton Loader or Artists + Track List */}
        {searching ? (
          <TrackSkeleton count={6} />
        ) : isSearchActive && resultType === "artists" ? (
          liveArtists.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-10 text-center backdrop-blur-xl">
              <p className="text-sm font-medium text-zinc-300">
                Không tìm thấy nghệ sĩ cho &ldquo;{debouncedQuery}&rdquo;
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {liveArtists.map((artist) => (
                <ArtistCard key={artist.id} artist={artist} variant="grid" />
              ))}
            </div>
          )
        ) : (
          <div className="space-y-4">
            {isSearchActive &&
              resultType === "all" &&
              liveArtists.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                      <Users className="h-3.5 w-3.5 text-zinc-400" />
                      Nghệ sĩ ({liveArtists.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setResultType("artists")}
                      className="text-[11px] text-zinc-400 hover:text-white"
                    >
                      Xem tất cả →
                    </button>
                  </div>
                  <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
                    {liveArtists.map((artist) => (
                      <ArtistCard
                        key={artist.id}
                        artist={artist}
                        variant="strip"
                      />
                    ))}
                  </div>
                </div>
              )}

            {displayedTracks.length === 0 &&
            (!isSearchActive ||
              resultType === "tracks" ||
              liveArtists.length === 0) ? (
              <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-10 text-center backdrop-blur-xl">
                <p className="text-sm font-medium text-zinc-300">
                  Không tìm thấy kết quả cho &ldquo;{debouncedQuery}&rdquo;
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Thử từ khóa khác, chọn nguồn khác hoặc nhập API Key cá nhân
                  trong API Settings.
                </p>
              </div>
            ) : (
              displayedTracks.length > 0 && (
                <motion.div
                  key={`${filter}-${debouncedQuery}`}
                  variants={listContainerVariants}
                  initial="hidden"
                  animate="visible"
                  className="space-y-1 rounded-2xl border border-white/10 bg-zinc-900/45 p-2 backdrop-blur-xl"
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
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}
