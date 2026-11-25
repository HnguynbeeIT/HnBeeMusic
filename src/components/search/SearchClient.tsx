"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import type { SearchResponse, TrackSource, UnifiedTrack } from "@/lib/audio/types";
import { SPRING_PHYSICS } from "@/lib/ui/source-theme";
import { useDebounce } from "@/hooks/useDebounce";
import { getByokHeaders, useSettingsStore } from "@/store/useSettingsStore";
import { useRegion } from "@/context/RegionContext";
import { RegionSelector } from "@/components/layout/RegionSelector";
import { TrackRow } from "@/components/track/TrackRow";
import { TrackSkeleton } from "@/components/track/TrackSkeleton";

const SOURCE_TABS: Array<{
  id: "all" | TrackSource;
  label: string;
  dotClass?: string;
}> = [
  { id: "all", label: "Tất cả" },
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
  const [tracks, setTracks] = useState<UnifiedTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceStatus, setSourceStatus] = useState<
    SearchResponse["sources"] | null
  >(null);

  useEffect(() => {
    if (initialQ) setQuery(initialQ);
  }, [initialQ]);

  const debouncedQuery = useDebounce(query, 400);
  const byokVersion = useSettingsStore(
    (s) => `${s.youtubeApiKey}:${s.spotifyClientId}:${s.spotifyClientSecret}`
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
        setSourceStatus(data.sources ?? null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setTracks([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, source, region, byokVersion]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm bài hát, nghệ sĩ trên Spotify, YouTube, SoundCloud..."
              className="w-full rounded-2xl border border-white/10 bg-zinc-900/60 py-3.5 pl-11 pr-10 text-sm text-white placeholder:text-zinc-500 backdrop-blur-xl focus:border-white/25 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Xóa từ khóa"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-500 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <RegionSelector />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-zinc-900/60 p-1 backdrop-blur-xl">
            {SOURCE_TABS.map((tab) => {
              const active = source === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSource(tab.id)}
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

          {sourceStatus &&
            sourceStatus.youtube === "fallback" &&
            sourceStatus.spotify === "fallback" && (
              <span className="text-[11px] text-zinc-500">
                Đang dùng danh mục mẫu (thêm API keys trong{" "}
                <code className="text-zinc-400">.env.local</code> để tìm kiếm
                trực tiếp)
              </span>
            )}
        </div>
      </div>

      {loading ? (
        <TrackSkeleton count={6} />
      ) : tracks.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-10 text-center backdrop-blur-xl">
          <p className="text-sm font-medium text-zinc-300">
            Không tìm thấy bài hát phù hợp cho &ldquo;{debouncedQuery}&rdquo;
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Thử từ khóa khác hoặc dán trực tiếp link Spotify / YouTube /
            SoundCloud ở trang Khám phá.
          </p>
        </div>
      ) : (
        <motion.div
          key={`${source}-${debouncedQuery}`}
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
