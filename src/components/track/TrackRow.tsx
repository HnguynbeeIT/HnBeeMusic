"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  FolderPlus,
  Heart,
  ListPlus,
  Pause,
  Play,
  Plus,
} from "lucide-react";
import type { UnifiedTrack } from "@/lib/audio/types";
import { formatDuration } from "@/lib/audio/normalize";
import {
  BUTTON_MOTION,
  SPRING_PHYSICS,
  getSourceTheme,
} from "@/lib/ui/source-theme";
import { usePlayerStore } from "@/store/usePlayerStore";
import { usePlaylistStore } from "@/store/usePlaylistStore";
import { SourceBadge } from "./SourceBadge";
import { TrackThumbnail } from "./TrackThumbnail";
import { AudioEqualizer } from "./AudioEqualizer";
import { ArtistLink } from "@/components/artist/ArtistLink";

interface TrackRowProps {
  track: UnifiedTrack;
  index?: number;
  contextQueue?: UnifiedTrack[];
}

export const trackRowVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: SPRING_PHYSICS,
  },
};

export function TrackRow({ track, index, contextQueue }: TrackRowProps) {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const likedTracks = usePlayerStore((s) => s.likedTracks);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const toggleLikeTrack = usePlayerStore((s) => s.toggleLikeTrack);

  const playlists = usePlaylistStore((s) => s.playlists);
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist);
  const addTrackToPlaylist = usePlaylistStore((s) => s.addTrackToPlaylist);

  const [menuOpen, setMenuOpen] = useState(false);
  const [newPlName, setNewPlName] = useState("");

  const isCurrent = currentTrack?.id === track.id;
  const isActivePlaying = isCurrent && isPlaying;
  const isLiked = likedTracks.some((t) => t.id === track.id);
  const theme = getSourceTheme(track.source);

  const handleQuickCreateAndAdd = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!newPlName.trim()) return;
    createPlaylist(newPlName.trim(), track);
    setNewPlName("");
    setMenuOpen(false);
  };

  return (
    <motion.div
      variants={trackRowVariants}
      onClick={() => playTrack(track, contextQueue)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          playTrack(track, contextQueue);
        }
      }}
      className={`group relative flex cursor-pointer items-center gap-3.5 rounded-xl border px-3.5 py-2.5 transition-colors ${
        isCurrent
          ? "border-white/15 bg-white/[0.07] shadow-lg shadow-black/30 backdrop-blur-md"
          : "border-transparent bg-transparent hover:border-white/[0.06] hover:bg-white/5"
      }`}
    >
      {/* Index or Animated AudioEqualizer */}
      <div className="hidden w-7 shrink-0 items-center justify-center sm:flex">
        {isCurrent ? (
          <AudioEqualizer playing={isActivePlaying} source={track.source} />
        ) : (
          <>
            <span className="font-mono text-xs tabular-nums text-zinc-500 group-hover:hidden">
              {typeof index === "number"
                ? String(index + 1).padStart(2, "0")
                : "•"}
            </span>
            <Play className="hidden h-3.5 w-3.5 fill-white text-white group-hover:block" />
          </>
        )}
      </div>

      {/* Artwork (rounded-md) with corner source indicator badge */}
      <div className="relative shrink-0">
        <TrackThumbnail
          src={track.thumbnail}
          alt={track.title}
          className="h-11 w-11 rounded-md"
        />
        <span
          title={theme.label}
          className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-[#09090b] text-[8px] font-bold text-white shadow-sm ${theme.barClass}`}
        >
          {theme.shortLabel[0]}
        </span>
        <div
          className={`absolute inset-0 flex items-center justify-center rounded-md bg-black/55 transition-opacity ${
            isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {isActivePlaying ? (
            <Pause className="h-4 w-4 fill-white text-white" />
          ) : (
            <Play className="h-4 w-4 translate-x-[1px] fill-white text-white" />
          )}
        </div>
      </div>

      {/* Title & Artist */}
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium transition-colors ${
            isCurrent ? theme.textClass : "text-zinc-100 group-hover:text-white"
          }`}
        >
          {track.title}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <ArtistLink
            name={track.artist}
            source={track.source}
            className="text-xs text-zinc-400"
          />
        </div>
      </div>

      {/* Source Pill (Desktop) */}
      <div className="hidden shrink-0 sm:block">
        <SourceBadge
          source={track.source}
          resolvedSource={track.resolvedSource}
        />
      </div>

      {/* Actions: Like, Add to Playlist, Add to Queue */}
      <div
        className="relative flex shrink-0 items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <motion.button
          type="button"
          {...BUTTON_MOTION}
          onClick={() => toggleLikeTrack(track)}
          aria-label={isLiked ? "Bỏ thích" : "Thích bài hát"}
          className={`rounded-lg p-1.5 transition-colors ${
            isLiked
              ? "text-emerald-400 hover:bg-emerald-500/10"
              : "text-zinc-500 opacity-70 hover:bg-white/10 hover:text-white group-hover:opacity-100"
          }`}
        >
          <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
        </motion.button>

        <motion.button
          type="button"
          {...BUTTON_MOTION}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Thêm vào Playlist"
          title="Thêm vào Playlist"
          className={`rounded-lg p-1.5 transition-colors ${
            menuOpen
              ? "bg-white/15 text-white"
              : "text-zinc-500 opacity-70 hover:bg-white/10 hover:text-white group-hover:opacity-100"
          }`}
        >
          <FolderPlus className="h-4 w-4" />
        </motion.button>

        <motion.button
          type="button"
          {...BUTTON_MOTION}
          onClick={() => addToQueue(track)}
          aria-label="Thêm vào hàng đợi"
          title="Thêm vào hàng đợi"
          className="rounded-lg p-1.5 text-zinc-500 opacity-70 transition-colors hover:bg-white/10 hover:text-white group-hover:opacity-100"
        >
          <ListPlus className="h-4 w-4" />
        </motion.button>

        {/* Add to Playlist Glass Popover */}
        {menuOpen && (
          <div className="absolute right-0 top-10 z-40 w-56 rounded-2xl border border-white/15 bg-zinc-900/95 p-2.5 shadow-2xl backdrop-blur-xl">
            <p className="mb-2 px-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Thêm vào Playlist
            </p>

            {playlists.length > 0 && (
              <div className="mb-2 max-h-36 space-y-1 overflow-y-auto">
                {playlists.map((pl) => {
                  const alreadyIn = pl.tracks.some((t) => t.id === track.id);
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => {
                        addTrackToPlaylist(pl.id, track);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
                    >
                      <span className="truncate">{pl.name}</span>
                      {alreadyIn && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <form
              onSubmit={handleQuickCreateAndAdd}
              className="flex items-center gap-1.5 border-t border-white/10 pt-2"
            >
              <input
                type="text"
                value={newPlName}
                onChange={(e) => setNewPlName(e.target.value)}
                placeholder="Tạo playlist mới..."
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white placeholder:text-zinc-500 focus:border-white/25 focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Tạo và thêm"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-950 hover:bg-zinc-200"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Duration with tabular-nums */}
      <span className="w-11 shrink-0 text-right font-mono text-xs tabular-nums text-zinc-500">
        {track.duration > 0 ? formatDuration(track.duration) : "--:--"}
      </span>
    </motion.div>
  );
}
