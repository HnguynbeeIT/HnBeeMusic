"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { ResolveResponse, TrackSource, UnifiedTrack } from "@/lib/audio/types";
import {
  BUTTON_MOTION,
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

const SOURCE_TABS: Array<{ id: FilterValue; label: string; dotClass?: string }> = [
  { id: "all", label: "Tất cả nền tảng" },
  { id: "spotify", label: "Spotify", dotClass: "bg-[#1DB954]" },
  { id: "youtube", label: "YouTube", dotClass: "bg-[#FF0000]" },
  { id: "soundcloud", label: "SoundCloud", dotClass: "bg-[#FF5500]" },
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
  const [loadingAlbumId, setLoadingAlbumId] = useState<string | null>(null);

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

    const params = new URLSearchParams({ name: artistName, source: "all" });
    if (artistId) params.set("id", artistId);
    if (
      initialSource === "youtube" ||
      initialSource === "spotify" ||
      initialSource === "soundcloud"
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

  const displayedTracks = useMemo<UnifiedTrack[]>(() => {
    if (!data?.tracks) return [];
    if (sourceFilter !== "all") {
      return data.tracks.filter((t) => t.source === sourceFilter);
    }
    // Cross-source smart deduplication for "Tất cả nền tảng"
    const seen = new Set<string>();
    const result: UnifiedTrack[] = [];
    for (const track of data.tracks) {
      const key = normalizeTitleForDedup(track.title);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      result.push(track);
    }
    return result;
  }, [data, sourceFilter]);

  const displayedAlbums = useMemo<ArtistAlbum[]>(() => {
    if (!data?.albums) return [];
    if (sourceFilter === "all") return data.albums;
    return data.albums.filter((a) => a.source === sourceFilter);
  }, [data, sourceFilter]);

  const profile = data?.profile;
  const theme = getSourceTheme(profile?.primarySource);

  const isFollowing = useMemo(() => {
    if (!profile) return false;
    const normName = profile.name.trim().toLowerCase();
    return followedArtists.some(
      (a) => a.id === profile.id || a.name.trim().toLowerCase() === normName
    );
  }, [followedArtists, profile]);

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
      <div className="space-y-8">
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
    <div className="space-y-8">
      {/* ARTIST HERO BANNER */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/60 p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl sm:p-8">
        {/* Dynamic Ambient Tinted Backdrop from Artist Avatar */}
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
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-[#09090b]/90 via-zinc-950/40 to-transparent"
        />

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end">
          {/* Artist Avatar */}
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
            {/* Verified + Platforms Found */}
            <div className="flex flex-wrap items-center gap-2">
              {profile.verified && (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-300">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Nghệ sĩ xác thực
                </span>
              )}
              {profile.sourcesFound.map((src) => (
                <SourceBadge key={src} source={src} />
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

            {/* Followers + Genres */}
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

            {/* ACTION BAR: Play All, Shuffle, Follow, External Links */}
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

              {Object.entries(profile.externalUrls).map(([src, url]) =>
                url ? (
                  <a
                    key={src}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[11px] capitalize text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {src} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null
              )}

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
          </div>
        </div>
      </section>

      {/* SOURCE FILTER TABS (layoutId="artistSourceTab") */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Bài hát phổ biến</h2>

        <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-zinc-900/60 p-1 backdrop-blur-xl">
          {SOURCE_TABS.map((tab) => {
            const active = sourceFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSourceFilter(tab.id)}
                className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  active ? "text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="artistSourceTab"
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

      {/* POPULAR TRACKS LIST */}
      {displayedTracks.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-8 text-center text-xs text-zinc-500 backdrop-blur-xl">
          Không có bài hát nào cho nguồn đang chọn. Hãy thử chọn &ldquo;Tất cả
          nền tảng&rdquo;.
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
