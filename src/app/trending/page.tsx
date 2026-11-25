"use client";

import { motion } from "framer-motion";
import { Flame, Play } from "lucide-react";
import {
  CURATED_PLAYLISTS,
  FALLBACK_CATALOG,
} from "@/lib/adapters/fallback-catalog";
import { BUTTON_MOTION } from "@/lib/ui/source-theme";
import { usePlayerStore } from "@/store/usePlayerStore";
import { TrackThumbnail } from "@/components/track/TrackThumbnail";
import { TrackRow } from "@/components/track/TrackRow";

const listContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03 } },
};

export default function TrendingPage() {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const trendingTracks = [...FALLBACK_CATALOG].reverse();

  return (
    <div className="space-y-8">
      <header className="space-y-1.5">
        <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-400">
          <Flame className="h-3.5 w-3.5" />
          <span>Bảng xếp hạng Đa nguồn</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Trending hôm nay
        </h1>
        <p className="text-sm text-zinc-400">
          Các playlist và bản nhạc được nghe nhiều nhất trên Spotify, YouTube &amp;
          SoundCloud.
        </p>
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

      {/* Trending Track List */}
      <motion.div
        variants={listContainerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-1 rounded-2xl border border-white/10 bg-zinc-900/40 p-2 backdrop-blur-xl"
      >
        {trendingTracks.map((track, idx) => (
          <TrackRow
            key={track.id}
            track={track}
            index={idx}
            contextQueue={trendingTracks}
          />
        ))}
      </motion.div>
    </div>
  );
}
