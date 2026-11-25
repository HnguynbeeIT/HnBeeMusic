"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Flame, Play } from "lucide-react";
import type { UnifiedTrack } from "@/lib/audio/types";
import {
  CURATED_PLAYLISTS,
  FALLBACK_CATALOG,
} from "@/lib/adapters/fallback-catalog";
import { BUTTON_MOTION } from "@/lib/ui/source-theme";
import { useRegion } from "@/context/RegionContext";
import { usePlayerStore } from "@/store/usePlayerStore";
import { getByokHeaders, useSettingsStore } from "@/store/useSettingsStore";
import { RegionSelector } from "@/components/layout/RegionSelector";
import { TrackThumbnail } from "@/components/track/TrackThumbnail";
import { TrackRow } from "@/components/track/TrackRow";
import { TrackSkeleton } from "@/components/track/TrackSkeleton";

const listContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03 } },
};

export default function TrendingPage() {
  const { region, regionInfo } = useRegion();
  const playTrack = usePlayerStore((s) => s.playTrack);
  const byokKey = useSettingsStore((s) => s.youtubeApiKey);

  const [tracks, setTracks] = useState<UnifiedTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/trending?region=${region}`, {
      signal: controller.signal,
      headers: getByokHeaders(),
    })
      .then((res) => res.json())
      .then((data: { tracks?: UnifiedTrack[] }) => {
        setTracks(data.tracks ?? []);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setTracks([...FALLBACK_CATALOG].reverse());
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [region, byokKey]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-400">
            <Flame className="h-3.5 w-3.5" />
            <span>
              Bảng xếp hạng · {regionInfo.flag} {regionInfo.label}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Trending hôm nay
          </h1>
          <p className="text-sm text-zinc-400">
            Cập nhật xu hướng âm nhạc trực tiếp theo khu vực bạn chọn.
          </p>
        </div>

        <RegionSelector />
      </header>

      {/* Featured Playlist Cards */}
      <section className="grid gap-4 sm:grid-cols-3">
        {CURATED_PLAYLISTS.map((pl) => {
          const plTracks = pl.trackIds
            .map((id) => FALLBACK_CATALOG.find((t) => t.id === id))
            .filter((t): t is NonNullable<typeof t> => Boolean(t));

          return (
            <div
              key={pl.id}
              onClick={() =>
                plTracks.length > 0 && playTrack(plTracks[0], plTracks)
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  if (plTracks.length > 0) playTrack(plTracks[0], plTracks);
                }
              }}
              className="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/60 p-4 shadow-xl backdrop-blur-xl transition-colors hover:bg-zinc-900/80"
            >
              <div className="relative mb-3 overflow-hidden rounded-xl">
                <TrackThumbnail
                  src={pl.thumbnail}
                  alt={pl.name}
                  className="aspect-video w-full rounded-xl transition-transform duration-500 group-hover:scale-105"
                />
                <motion.div
                  {...BUTTON_MOTION}
                  className="absolute bottom-2.5 right-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-950 shadow-xl"
                >
                  <Play className="h-4 w-4 translate-x-[1px] fill-zinc-950" />
                </motion.div>
              </div>
              <h3 className="truncate text-sm font-semibold text-white">
                {pl.name}
              </h3>
              <p className="mt-0.5 truncate text-xs text-zinc-400">
                {pl.subtitle}
              </p>
            </div>
          );
        })}
      </section>

      {/* Regional Trending Track List */}
      {loading ? (
        <TrackSkeleton count={8} />
      ) : (
        <motion.div
          key={region}
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
      )}
    </div>
  );
}
