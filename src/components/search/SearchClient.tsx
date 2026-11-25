"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, Loader2, Play, Search, Users, X } from "lucide-react";
import type {
  ArtistSearchItem,
  SearchResponse,
  TrackSource,
  UnifiedTrack,
} from "@/lib/audio/types";
import type { UnifiedArtistResponse } from "@/lib/adapters/artist";
import { REGIONS } from "@/lib/audio/region";
import { BUTTON_MOTION, SPRING_PHYSICS } from "@/lib/ui/source-theme";
import { useDebounce } from "@/hooks/useDebounce";
import { usePlayerStore } from "@/store/usePlayerStore";
import { getByokHeaders, useSettingsStore } from "@/store/useSettingsStore";
import { useRegion } from "@/context/RegionContext";
import { RegionSelector } from "@/components/layout/RegionSelector";
import { TrackRow } from "@/components/track/TrackRow";
import { TrackSkeleton } from "@/components/track/TrackSkeleton";
import { TrackThumbnail } from "@/components/track/TrackThumbnail";
import { ArtistCard } from "@/components/artist/ArtistCard";
import { buildArtistHref } from "@/components/artist/ArtistLink";

type ResultTypeTab = "all" | "tracks" | "artists";

const RESULT_TYPE_TABS: Array<{ id: ResultTypeTab; label: string }> = [
  { id: "all", label: "Tất cả" },
  { id: "tracks", label: "Bài hát" },
  { id: "artists", label: "Nghệ sĩ" },
];

const SOURCE_TABS: Array<{
  id: "all" | TrackSource;
  label: string;
  dotClass?: string;
}> = [
  { id: "all", label: "Tất cả nguồn" },
  { id: "spotify", label: "Spotify", dotClass: "bg-[#1DB954]" },
  { id: "youtube", label: "YouTube", dotClass: "bg-[#FF0000]" },
  { id: "soundcloud", label: "SoundCloud", dotClass: "bg-[#FF5500]" },
];

const listContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03 } },
};

export function SearchClient() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") || "";
  const { region } = useRegion();

  const [query, setQuery] = useState(initialQ);
  const [source, setSource] = useState<"all" | TrackSource>("all");
  const [resultType, setResultType] = useState<ResultTypeTab>("all");
  const [tracks, setTracks] = useState<UnifiedTrack[]>([]);
  const [artists, setArtists] = useState<ArtistSearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [playingArtistId, setPlayingArtistId] = useState<string | null>(null);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const [sourceStatus, setSourceStatus] = useState<
    SearchResponse["sources"] | null
  >(null);

  const handleQuickPlayTopArtist = async (
    e: React.MouseEvent,
    artist: ArtistSearchItem
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (playingArtistId) return;
    setPlayingArtistId(artist.id);
    try {
      const params = new URLSearchParams({
        name: artist.name,
        source: "all",
        preferredSource: artist.source,
      });
      if (artist.artistId) params.set("id", artist.artistId);
      const res = await fetch(`/api/artist?${params.toString()}`, {
        headers: getByokHeaders(),
      });
      const data = (await res.json()) as UnifiedArtistResponse;
      if (res.ok && data.tracks?.length > 0) {
        playTrack(data.tracks[0], data.tracks);
      }
    } finally {
      setPlayingArtistId(null);
    }
  };

  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialQ) setQuery(initialQ);
  }, [initialQ]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const debouncedQuery = useDebounce(query, 400);
  const byokVersion = useSettingsStore(
    (s) =>
      `${s.youtubeApiKey}:${s.spotifyClientId}:${s.spotifyClientSecret}:${s.soundcloudClientId}`
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    params.set("source", source);
    params.set("region", region);

    fetch(`/api/search?${params.toString()}`, {
      signal: controller.signal,
      headers: getByokHeaders(),
    })
      .then((res) => res.json())
      .then((data: SearchResponse) => {
        setTracks(data.tracks ?? []);
        setArtists(data.artists ?? []);
        setSourceStatus(data.sources ?? null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setTracks([]);
        setArtists([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, source, region, byokVersion]);

  const showInstantDropdown =
    dropdownOpen && query.trim().length >= 2 && artists.length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {/* Search Input + Instant Artist Dropdown + Region Selector */}
        <div className="flex items-center gap-2.5">
          <div ref={searchBoxRef} className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={query}
              onFocus={() => setDropdownOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setDropdownOpen(true);
              }}
              placeholder="Tìm bài hát, nghệ sĩ hoặc dán link Spotify Artist / YouTube @handle..."
              className="w-full rounded-2xl border border-white/10 bg-zinc-900/60 py-3.5 pl-11 pr-10 text-sm text-white placeholder:text-zinc-500 backdrop-blur-xl focus:border-white/25 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setDropdownOpen(false);
                }}
                aria-label="Xóa từ khóa"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-500 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* Instant Search Dropdown: Top 3 Matching Artists */}
            <AnimatePresence>
              {showInstantDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={SPRING_PHYSICS}
                  className="absolute inset-x-0 top-14 z-40 overflow-hidden rounded-2xl border border-white/15 bg-zinc-900/95 p-2 shadow-2xl shadow-black/70 backdrop-blur-2xl"
                >
                  <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Gợi ý Nghệ sĩ nhanh
                  </p>
                  <div className="space-y-0.5">
                    {artists.slice(0, 3).map((artist) => {
                      const reg = REGIONS[artist.region];
                      return (
                        <Link
                          key={artist.id}
                          href={buildArtistHref(
                            artist.name,
                            artist.source,
                            artist.artistId
                          )}
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-white/10"
                        >
                          <TrackThumbnail
                            src={artist.avatar}
                            alt={artist.name}
                            className="h-9 w-9 rounded-full"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <span className="truncate text-xs font-semibold text-white">
                                {artist.name}
                              </span>
                              {artist.verified && (
                                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                              )}
                            </div>
                            <p className="truncate text-[11px] text-zinc-400">
                              {reg.flag} {reg.shortLabel} &bull;{" "}
                              {artist.language}
                            </p>
                          </div>
                          <span className="text-[11px] text-zinc-500">
                            Trang nghệ sĩ →
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <RegionSelector />
        </div>

        {/* Result Type Tabs (Tất cả | Bài hát | Nghệ sĩ) + Source Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-zinc-900/60 p-1 backdrop-blur-xl">
            {RESULT_TYPE_TABS.map((tab) => {
              const active = resultType === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setResultType(tab.id)}
                  className={`relative rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    active ? "text-zinc-950" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="searchResultTypeTab"
                      transition={SPRING_PHYSICS}
                      className="absolute inset-0 -z-10 rounded-full bg-white shadow-sm"
                    />
                  )}
                  {tab.label}
                  {tab.id === "artists" && artists.length > 0 && (
                    <span className="ml-1 font-mono text-[10px] opacity-75">
                      ({artists.length})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-zinc-900/60 p-1 backdrop-blur-xl">
            {SOURCE_TABS.map((tab) => {
              const active = source === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSource(tab.id)}
                  className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
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

        {sourceStatus &&
          sourceStatus.youtube === "fallback" &&
          sourceStatus.spotify === "fallback" && (
            <span className="block text-[11px] text-zinc-500">
              Đang dùng danh mục mẫu (thêm API keys trong{" "}
              <code className="text-zinc-400">API Settings</code> để tìm kiếm
              trực tiếp)
            </span>
          )}
      </div>

      {/* Results Area */}
      {loading ? (
        <TrackSkeleton count={6} />
      ) : resultType === "artists" ? (
        /* DEDICATED ARTISTS GRID VIEW */
        artists.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-10 text-center backdrop-blur-xl">
            <p className="text-sm font-medium text-zinc-300">
              Không tìm thấy nghệ sĩ phù hợp cho &ldquo;{debouncedQuery}&rdquo;
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {artists.map((artist) => (
              <ArtistCard key={artist.id} artist={artist} variant="grid" />
            ))}
          </div>
        )
      ) : (
        <div className="space-y-6">
          {/* Top Artist Spotlight + Horizontal Strip (shown in "Tất cả" tab above tracks) */}
          {resultType === "all" && artists.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold text-white">
                    Kết quả nghệ sĩ hàng đầu ({artists.length})
                  </h2>
                </div>
                {artists.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setResultType("artists")}
                    className="text-xs text-zinc-400 hover:text-white"
                  >
                    Xem tất cả nghệ sĩ →
                  </button>
                )}
              </div>

              {/* Top Artist Spotlight Card */}
              {(() => {
                const top = artists[0];
                const reg = REGIONS[top.region];
                const isBusy = playingArtistId === top.id;
                return (
                  <Link
                    href={top.href || buildArtistHref(top.name, top.source, top.artistId)}
                    className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-white/15 bg-zinc-900/70 p-4 shadow-xl backdrop-blur-xl transition-colors hover:border-white/25 hover:bg-zinc-900/90"
                  >
                    <TrackThumbnail
                      src={top.avatarUrl || top.avatar}
                      alt={top.name}
                      className="h-18 w-18 rounded-full ring-2 ring-white/15 transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="truncate text-lg font-bold text-white">
                          {top.name}
                        </h3>
                        {top.verified && (
                          <BadgeCheck className="h-4 w-4 shrink-0 text-sky-400" />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {reg.flag} {reg.shortLabel} &bull; {top.language}
                        {top.followers && top.followers > 0
                          ? ` · ${
                              top.followers >= 1_000_000
                                ? `${(top.followers / 1_000_000).toFixed(1)}M`
                                : top.followers >= 1_000
                                ? `${(top.followers / 1_000).toFixed(1)}K`
                                : top.followers
                            } người theo dõi`
                          : ""}
                      </p>
                      {top.genres.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {top.genres.slice(0, 3).map((g) => (
                            <span
                              key={g}
                              className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] capitalize text-zinc-300"
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <motion.button
                      type="button"
                      {...BUTTON_MOTION}
                      onClick={(e) => void handleQuickPlayTopArtist(e, top)}
                      aria-label={`Phát nhạc của ${top.name}`}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1DB954] text-zinc-950 shadow-xl shadow-emerald-500/25 transition-transform group-hover:scale-105"
                    >
                      {isBusy ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Play className="h-5 w-5 translate-x-[1px] fill-zinc-950" />
                      )}
                    </motion.button>
                  </Link>
                );
              })()}

              {/* Remaining matched artists horizontal strip */}
              {artists.length > 1 && (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {artists.slice(1).map((artist) => (
                    <ArtistCard
                      key={artist.id}
                      artist={artist}
                      variant="strip"
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Tracks List */}
          {tracks.length === 0 &&
          (resultType === "tracks" || artists.length === 0) ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-10 text-center backdrop-blur-xl">
              <p className="text-sm font-medium text-zinc-300">
                Không tìm thấy bài hát phù hợp cho &ldquo;{debouncedQuery}&rdquo;
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Thử từ khóa khác hoặc dán trực tiếp link Spotify / YouTube /
                SoundCloud.
              </p>
            </div>
          ) : (
            tracks.length > 0 && (
              <motion.div
                key={`${source}-${region}-${debouncedQuery}`}
                variants={listContainerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-1 rounded-2xl border border-white/10 bg-zinc-900/40 p-2 backdrop-blur-xl"
              >
                {tracks.map((track, idx) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={idx}
                    contextQueue={tracks}
                  />
                ))}
              </motion.div>
            )
          )}
        </div>
      )}
    </div>
  );
}
