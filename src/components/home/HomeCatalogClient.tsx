"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ListPlus,
  Pause,
  Play,
  Search,
  Shuffle,
  Sparkles,
  X,
} from "lucide-react";
import type { SearchResponse, TrackSource, UnifiedTrack } from "@/lib/audio/types";
import {
  BUTTON_MOTION,
  SPRING_PHYSICS,
  getSourceTheme,
} from "@/lib/ui/source-theme";
import { useDebounce } from "@/hooks/useDebounce";
import { usePlayerStore } from "@/store/usePlayerStore";
import { getByokHeaders, useSettingsStore } from "@/store/useSettingsStore";
import { TrackRow } from "@/components/track/TrackRow";
import { TrackThumbnail } from "@/components/track/TrackThumbnail";
import { TrackSkeleton } from "@/components/track/TrackSkeleton";
import { SourceBadge } from "@/components/track/SourceBadge";
import { ArtistLink } from "@/components/artist/ArtistLink";

type FilterValue = "all" | TrackSource;

const FILTER_TABS: Array<{ id: FilterValue; label: string; dotClass?: string }> = [
  { id: "all", label: "Tất cả" },
  { id: "spotify", label: "Spotify", dotClass: "bg-[#1DB954]" },
  { id: "youtube", label: "YouTube", dotClass: "bg-[#FF0000]" },
  { id: "soundcloud", label: "SoundCloud", dotClass: "bg-[#FF5500]" },
];

const listContainerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.03,
    },
  },
};

export function HomeCatalogClient({ tracks }: { tracks: UnifiedTrack[] }) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [liveResults, setLiveResults] = useState<UnifiedTrack[] | null>(null);
  const [searching, setSearching] = useState(false);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isShuffle = usePlayerStore((s) => s.isShuffle);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
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
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);

    const params = new URLSearchParams({
      q: debouncedQuery.trim(),
      source: filter,
    });

    fetch(`/api/search?${params.toString()}`, {
      signal: controller.signal,
      headers: getByokHeaders(),
    })
      .then((res) => res.json())
      .then((data: SearchResponse) => {
        setLiveResults(data.tracks ?? []);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLiveResults([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, filter, isSearchActive, byokVersion]);

  const displayedTracks = useMemo(() => {
    if (isSearchActive) return liveResults ?? [];
    if (filter === "all") return tracks;
    return tracks.filter((t) => t.source === filter);
  }, [tracks, filter, isSearchActive, liveResults]);

  const heroTrack = currentTrack ?? tracks[0];
  const heroTheme = getSourceTheme(heroTrack?.source);
  const isHeroPlaying =
    Boolean(heroTrack) && currentTrack?.id === heroTrack.id && isPlaying;

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

  const focusImportUrlBar = () => {
    const input = document.getElementById(
      "hnbee-import-url-input"
    ) as HTMLInputElement | null;
    if (input) {
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus();
    }
  };

  return (
    <div className="space-y-8">
      {/* HERO BANNER */}
      {heroTrack && (
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/60 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-25 blur-[90px] transition-all duration-1000"
            style={{ background: heroTheme.ambientRadial }}
          />

          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
            <motion.div
              animate={{ scale: isHeroPlaying ? 1.04 : 1 }}
              transition={SPRING_PHYSICS}
              style={{
                boxShadow: isHeroPlaying ? heroTheme.glowShadow : undefined,
              }}
              className="shrink-0 self-start rounded-2xl shadow-2xl shadow-black/70"
            >
              <TrackThumbnail
                src={heroTrack.thumbnail}
                alt={heroTrack.title}
                className="h-36 w-36 rounded-2xl sm:h-44 sm:w-44"
              />
            </motion.div>

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-zinc-300">
                  <Sparkles className="h-3 w-3 text-amber-400" />
                  {currentTrack ? "Đang phát nổi bật" : "Tuyển chọn Audiophile"}
                </span>
                <SourceBadge
                  source={heroTrack.source}
                  resolvedSource={heroTrack.resolvedSource}
                />
              </div>

              <div>
                <h1 className="truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {heroTrack.title}
                </h1>
                <div className="mt-1">
                  <ArtistLink
                    name={heroTrack.artist}
                    source={heroTrack.source}
                    className="text-sm text-zinc-400"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <motion.button
                  type="button"
                  {...BUTTON_MOTION}
                  onClick={() => playTrack(heroTrack, tracks)}
                  style={{ boxShadow: heroTheme.glowShadow }}
                  className="flex h-13 w-13 items-center justify-center rounded-full bg-white text-zinc-950 shadow-xl"
                  aria-label={isHeroPlaying ? "Tạm dừng" : "Phát ngay"}
                >
                  {isHeroPlaying ? (
                    <Pause className="h-6 w-6 fill-zinc-950" />
                  ) : (
                    <Play className="h-6 w-6 translate-x-[2px] fill-zinc-950" />
                  )}
                </motion.button>

                <motion.button
                  type="button"
                  {...BUTTON_MOTION}
                  onClick={handlePlayAll}
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/15"
                >
                  Phát danh sách ({displayedTracks.length})
                </motion.button>

                <motion.button
                  type="button"
                  {...BUTTON_MOTION}
                  onClick={handleShufflePlay}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-4 py-2.5 text-xs font-medium text-zinc-300 hover:bg-white/10 hover:text-white"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  Ngẫu nhiên
                </motion.button>

                <motion.button
                  type="button"
                  {...BUTTON_MOTION}
                  onClick={focusImportUrlBar}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
                >
                  <ListPlus className="h-3.5 w-3.5" />
                  Import Playlist URL
                </motion.button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* LIVE MULTI-SOURCE SEARCH + SOURCE FILTER TABS + TRACK LIST */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Live Debounced Search Input */}
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm trực tiếp Spotify, YouTube, SoundCloud..."
              className="w-full rounded-full border border-white/10 bg-zinc-900/60 py-2 pl-10 pr-9 text-xs text-white placeholder:text-zinc-500 backdrop-blur-xl focus:border-white/25 focus:outline-none"
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
          </div>

          {/* Source Filter Pills (layoutId="activeSourceTab") */}
          <div className="inline-flex items-center gap-1 self-start rounded-full border border-white/10 bg-zinc-900/60 p-1 backdrop-blur-xl sm:self-auto">
            {FILTER_TABS.map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
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

        {/* Skeleton Loader or Staggered Track List */}
        {searching ? (
          <TrackSkeleton count={6} />
        ) : displayedTracks.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-10 text-center backdrop-blur-xl">
            <p className="text-sm font-medium text-zinc-300">
              Không tìm thấy kết quả cho &ldquo;{debouncedQuery}&rdquo;
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Thử từ khóa khác, chọn nguồn khác hoặc nhập API Key cá nhân trong
              API Settings.
            </p>
          </div>
        ) : (
          <motion.div
            key={`${filter}-${debouncedQuery}`}
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
      </section>
    </div>
  );
}
