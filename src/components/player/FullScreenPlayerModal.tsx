"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Headphones,
  Heart,
  ListMusic,
  Loader2,
  MicVocal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import {
  BUTTON_MOTION,
  SPRING_PHYSICS,
  getSourceTheme,
} from "@/lib/ui/source-theme";
import { TrackThumbnail } from "@/components/track/TrackThumbnail";
import { SourceBadge } from "@/components/track/SourceBadge";
import { SeekBar } from "./SeekBar";

export function FullScreenPlayerModal() {
  const isOpen = usePlayerStore((s) => s.isFullPlayerOpen);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const isShuffle = usePlayerStore((s) => s.isShuffle);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const likedTracks = usePlayerStore((s) => s.likedTracks);

  const setFullPlayerOpen = usePlayerStore((s) => s.setFullPlayerOpen);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrev = usePlayerStore((s) => s.playPrev);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeatMode = usePlayerStore((s) => s.cycleRepeatMode);
  const toggleLikeTrack = usePlayerStore((s) => s.toggleLikeTrack);
  const setQueueOpen = usePlayerStore((s) => s.setQueueOpen);
  const setLyricsOpen = usePlayerStore((s) => s.setLyricsOpen);
  const audioOnlyMode = useSettingsStore((s) => s.audioOnlyMode);
  const toggleAudioOnlyMode = useSettingsStore((s) => s.toggleAudioOnlyMode);

  const isLiked = currentTrack
    ? likedTracks.some((t) => t.id === currentTrack.id)
    : false;
  const theme = getSourceTheme(currentTrack?.source);

  return (
    <AnimatePresence>
      {isOpen && currentTrack && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex flex-col bg-[#09090b]/95 backdrop-blur-2xl"
        >
          {/* Dynamic Ambient Artwork Glow */}
          {currentTrack.thumbnail && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center opacity-30 blur-[120px] transition-all duration-1000"
              style={{ backgroundImage: `url(${currentTrack.thumbnail})` }}
            />
          )}

          {/* Top Bar (iOS Dynamic Island safe-area aware, 44x44px touch targets) */}
          <div className="flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <motion.button
              type="button"
              {...BUTTON_MOTION}
              onClick={() => setFullPlayerOpen(false)}
              aria-label="Thu gọn trình phát"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <ChevronDown className="h-6 w-6" />
            </motion.button>

            <div className="flex flex-col items-center">
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">
                Now Playing
              </span>
              <div className="mt-1">
                <SourceBadge
                  source={currentTrack.source}
                  resolvedSource={currentTrack.resolvedSource}
                />
              </div>
            </div>

            <div className="flex items-center gap-0.5">
              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={toggleAudioOnlyMode}
                aria-label="Chế độ Audio Only / Phát nền"
                title="Chế độ Audio Only / Phát nền"
                className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                  audioOnlyMode
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "text-zinc-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Headphones className="h-5 w-5" />
              </motion.button>
              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={() => {
                  setFullPlayerOpen(false);
                  setLyricsOpen(true);
                }}
                aria-label="Mở lời bài hát"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <MicVocal className="h-5 w-5" />
              </motion.button>
              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={() => {
                  setFullPlayerOpen(false);
                  setQueueOpen(true);
                }}
                aria-label="Mở hàng đợi"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <ListMusic className="h-5 w-5" />
              </motion.button>
            </div>
          </div>

          {/* Main Content (Home Indicator safe-area bottom padding) */}
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
            <motion.div
              layoutId="playerArtwork"
              animate={{ scale: isPlaying ? 1.05 : 1 }}
              transition={SPRING_PHYSICS}
              style={{
                boxShadow: isPlaying ? theme.glowShadow : undefined,
              }}
              className="aspect-square w-full max-w-[320px] rounded-3xl shadow-2xl shadow-black/70"
            >
              <TrackThumbnail
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                className="h-full w-full rounded-3xl"
              />
            </motion.div>

            <div className="mt-9 flex w-full items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold text-white">
                  {currentTrack.title}
                </h2>
                <p className="mt-1 truncate text-sm text-zinc-400">
                  {currentTrack.artist}
                </p>
              </div>
              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={() => toggleLikeTrack(currentTrack)}
                aria-label={isLiked ? "Bỏ thích" : "Thích"}
                className={`rounded-xl p-2.5 ${
                  isLiked ? "text-emerald-400" : "text-zinc-400 hover:text-white"
                }`}
              >
                <Heart className={`h-5 w-5 ${isLiked ? "fill-current" : ""}`} />
              </motion.button>
            </div>

            <div className="mt-6 w-full">
              <SeekBar
                progress={progress}
                duration={duration}
                source={currentTrack.source}
                onSeek={seekTo}
              />
            </div>

            <div className="mt-8 flex w-full items-center justify-between px-2">
              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={toggleShuffle}
                aria-label="Shuffle"
                className={`p-2 ${isShuffle ? theme.textClass : "text-zinc-400"}`}
              >
                <Shuffle className="h-5 w-5" />
              </motion.button>

              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={playPrev}
                aria-label="Bài trước"
                className="p-2 text-zinc-200 hover:text-white"
              >
                <SkipBack className="h-7 w-7 fill-current" />
              </motion.button>

              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={togglePlay}
                aria-label={isPlaying ? "Tạm dừng" : "Phát"}
                style={{ boxShadow: isPlaying ? theme.glowShadow : undefined }}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-zinc-950 shadow-xl"
              >
                {isLoading ? (
                  <Loader2 className="h-7 w-7 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-7 w-7 fill-zinc-950" />
                ) : (
                  <Play className="h-7 w-7 translate-x-[2px] fill-zinc-950" />
                )}
              </motion.button>

              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={() => playNext(false)}
                aria-label="Bài kế tiếp"
                className="p-2 text-zinc-200 hover:text-white"
              >
                <SkipForward className="h-7 w-7 fill-current" />
              </motion.button>

              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={cycleRepeatMode}
                aria-label="Repeat"
                className={`p-2 ${
                  repeatMode !== "off" ? theme.textClass : "text-zinc-400"
                }`}
              >
                {repeatMode === "one" ? (
                  <Repeat1 className="h-5 w-5" />
                ) : (
                  <Repeat className="h-5 w-5" />
                )}
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
