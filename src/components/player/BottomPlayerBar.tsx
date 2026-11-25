"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Heart,
  ListMusic,
  Loader2,
  Maximize2,
  MicVocal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useLyricsStore } from "@/store/useLyricsStore";
import {
  BUTTON_MOTION,
  SPRING_PHYSICS,
  getSourceTheme,
} from "@/lib/ui/source-theme";
import { SourceBadge } from "@/components/track/SourceBadge";
import { TrackThumbnail } from "@/components/track/TrackThumbnail";
import { ArtistLink } from "@/components/artist/ArtistLink";
import { SeekBar } from "./SeekBar";

export function BottomPlayerBar() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const isShuffle = usePlayerStore((s) => s.isShuffle);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const isQueueOpen = usePlayerStore((s) => s.isQueueOpen);
  const isLyricsOpen = usePlayerStore((s) => s.isLyricsOpen);
  const isFullPlayerOpen = usePlayerStore((s) => s.isFullPlayerOpen);
  const queue = usePlayerStore((s) => s.queue);
  const playbackError = usePlayerStore((s) => s.playbackError);
  const playbackNotice = usePlayerStore((s) => s.playbackNotice);
  const likedTracks = usePlayerStore((s) => s.likedTracks);

  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrev = usePlayerStore((s) => s.playPrev);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const cycleRepeatMode = usePlayerStore((s) => s.cycleRepeatMode);
  const toggleQueueOpen = usePlayerStore((s) => s.toggleQueueOpen);
  const toggleLyricsOpen = usePlayerStore((s) => s.toggleLyricsOpen);
  const setFullPlayerOpen = usePlayerStore((s) => s.setFullPlayerOpen);
  const toggleLikeTrack = usePlayerStore((s) => s.toggleLikeTrack);
  const hasLyrics = useLyricsStore((s) => s.hasLyrics);
  const isFullScreenLyrics = useLyricsStore((s) => s.isFullScreenLyrics);

  const isLiked = currentTrack
    ? likedTracks.some((t) => t.id === currentTrack.id)
    : false;
  const effectiveVolume = isMuted ? 0 : volume;
  const progressRatio =
    duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;
  const theme = getSourceTheme(currentTrack?.source);
  const shouldMarquee = Boolean(currentTrack && currentTrack.title.length > 26);

  return (
    <>
      {/* Playback info / SponsorBlock auto-skip toast */}
      <AnimatePresence>
        {playbackNotice && !playbackError && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={SPRING_PHYSICS}
            className="pointer-events-none fixed bottom-32 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-400/30 bg-zinc-900/90 px-4 py-2 text-xs font-medium text-emerald-200 shadow-2xl shadow-black/60 backdrop-blur-xl md:bottom-28"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span>{playbackNotice}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Playback error toast */}
      <AnimatePresence>
        {playbackError && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={SPRING_PHYSICS}
            className="fixed bottom-32 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-2 rounded-xl border border-rose-500/30 bg-zinc-900/95 px-4 py-2.5 text-xs text-rose-300 shadow-2xl backdrop-blur-xl md:bottom-28"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{playbackError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MOBILE FLOATING MINI PLAYER (bottom-16) */}
      <AnimatePresence>
        {currentTrack && !isFullPlayerOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={SPRING_PHYSICS}
            onClick={() => setFullPlayerOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setFullPlayerOpen(true);
            }}
            className="fixed inset-x-2 bottom-16 z-40 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/75 shadow-2xl backdrop-blur-xl md:hidden"
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <motion.div
                layoutId="playerArtworkMobile"
                animate={{ scale: isPlaying ? 1.05 : 1 }}
                transition={SPRING_PHYSICS}
                style={{
                  boxShadow: isPlaying ? theme.glowShadow : "none",
                }}
                className="shrink-0 rounded-lg"
              >
                <TrackThumbnail
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className="h-10 w-10 rounded-lg"
                />
              </motion.div>

              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium text-white">
                  {currentTrack.title}
                </p>
                <div className="flex items-center gap-1.5">
                  <ArtistLink
                    name={currentTrack.artist}
                    source={currentTrack.source}
                    className="text-xs text-zinc-400"
                  />
                  <SourceBadge
                    source={currentTrack.source}
                    resolvedSource={currentTrack.resolvedSource}
                    compact
                  />
                </div>
              </div>

              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                aria-label={isPlaying ? "Tạm dừng" : "Phát"}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-zinc-950 shadow-md"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-4 w-4 fill-zinc-950" />
                ) : (
                  <Play className="h-4 w-4 translate-x-[1px] fill-zinc-950" />
                )}
              </motion.button>
            </div>
            {/* Source-colored hairline progress */}
            <div className="h-0.5 w-full bg-white/10">
              <div
                className={`h-full w-full origin-left ${theme.barClass}`}
                style={{ transform: `scaleX(${progressRatio})` }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DESKTOP FLOATING GLASS PLAYER BAR (fixed bottom-3 inset-x-3 h-[88px] rounded-2xl z-50 grid-cols-3) */}
      <footer className="fixed inset-x-3 bottom-3 z-50 hidden h-[88px] grid-cols-3 items-center rounded-2xl border border-white/10 bg-zinc-900/60 px-5 shadow-2xl shadow-black/60 backdrop-blur-xl md:grid">
        {/* Col 1: Track Artwork (scale 1.05 + glow when playing), Marquee Title, Artist & Source Badge */}
        <div className="flex min-w-0 items-center gap-3.5 pr-4">
          {currentTrack ? (
            <>
              <motion.div
                layoutId={!isFullPlayerOpen ? "playerArtwork" : undefined}
                animate={{ scale: isPlaying ? 1.05 : 1 }}
                transition={SPRING_PHYSICS}
                style={{
                  boxShadow: isPlaying ? theme.glowShadow : "none",
                }}
                onClick={() => setFullPlayerOpen(true)}
                className="shrink-0 cursor-pointer rounded-xl"
              >
                <TrackThumbnail
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className="h-14 w-14 rounded-xl"
                />
              </motion.div>

              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="overflow-hidden whitespace-nowrap">
                  <p
                    className={`text-sm font-semibold text-white ${
                      shouldMarquee ? "animate-marquee pr-8" : "truncate"
                    }`}
                  >
                    {currentTrack.title}
                  </p>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <ArtistLink
                    name={currentTrack.artist}
                    source={currentTrack.source}
                    className="text-xs text-zinc-400"
                  />
                  <SourceBadge
                    source={currentTrack.source}
                    resolvedSource={currentTrack.resolvedSource}
                  />
                </div>
              </div>

              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={() => toggleLikeTrack(currentTrack)}
                aria-label={isLiked ? "Bỏ thích" : "Thích bài hát"}
                className={`rounded-lg p-2 transition-colors ${
                  isLiked
                    ? "text-emerald-400 hover:bg-emerald-500/10"
                    : "text-zinc-500 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Heart className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`} />
              </motion.button>
            </>
          ) : (
            <div className="flex items-center gap-3 text-zinc-500">
              <div className="h-12 w-12 rounded-xl border border-dashed border-white/15 bg-black/30" />
              <div>
                <p className="text-sm font-medium text-zinc-300">
                  Sẵn sàng phát nhạc
                </p>
                <p className="text-xs text-zinc-500">
                  Chọn bài hoặc dán link Spotify, YouTube, SoundCloud
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Col 2: Controls (Prominent White Play/Pause) + Source-Colored SeekBar */}
        <div className="flex flex-col items-center justify-center gap-1.5">
          <div className="flex items-center gap-4">
            <motion.button
              type="button"
              {...BUTTON_MOTION}
              onClick={toggleShuffle}
              aria-label="Phát ngẫu nhiên"
              title="Phát ngẫu nhiên"
              className={`rounded-lg p-1.5 transition-colors ${
                isShuffle
                  ? theme.textClass
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Shuffle className="h-4 w-4" />
            </motion.button>

            <motion.button
              type="button"
              {...BUTTON_MOTION}
              onClick={playPrev}
              disabled={!currentTrack}
              aria-label="Bài trước"
              className="rounded-lg p-1.5 text-zinc-300 transition-colors hover:text-white disabled:opacity-35"
            >
              <SkipBack className="h-5 w-5 fill-current" />
            </motion.button>

            <motion.button
              type="button"
              {...BUTTON_MOTION}
              onClick={togglePlay}
              disabled={!currentTrack}
              aria-label={isPlaying ? "Tạm dừng" : "Phát nhạc"}
              style={{
                boxShadow:
                  isPlaying && currentTrack ? theme.glowShadow : undefined,
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-950 shadow-lg transition-shadow disabled:opacity-40"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-5 w-5 fill-zinc-950" />
              ) : (
                <Play className="h-5 w-5 translate-x-[1px] fill-zinc-950" />
              )}
            </motion.button>

            <motion.button
              type="button"
              {...BUTTON_MOTION}
              onClick={() => playNext(false)}
              disabled={!currentTrack}
              aria-label="Bài tiếp theo"
              className="rounded-lg p-1.5 text-zinc-300 transition-colors hover:text-white disabled:opacity-35"
            >
              <SkipForward className="h-5 w-5 fill-current" />
            </motion.button>

            <motion.button
              type="button"
              {...BUTTON_MOTION}
              onClick={cycleRepeatMode}
              aria-label="Chế độ lặp lại"
              title={`Lặp lại: ${repeatMode}`}
              className={`rounded-lg p-1.5 transition-colors ${
                repeatMode !== "off"
                  ? theme.textClass
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {repeatMode === "one" ? (
                <Repeat1 className="h-4 w-4" />
              ) : (
                <Repeat className="h-4 w-4" />
              )}
            </motion.button>
          </div>

          <div className="w-full max-w-lg">
            <SeekBar
              progress={progress}
              duration={duration}
              source={currentTrack?.source}
              onSeek={seekTo}
              disabled={!currentTrack}
            />
          </div>
        </div>

        {/* Col 3: Queue Drawer, Lyrics Panel, Volume Slider, Expand */}
        <div className="flex items-center justify-end gap-2.5 pl-4">
          <motion.button
            type="button"
            {...BUTTON_MOTION}
            onClick={toggleLyricsOpen}
            aria-label="Lời bài hát"
            title={
              hasLyrics
                ? "Lời bài hát (Đã có lời đồng bộ)"
                : "Lời bài hát (Lyrics)"
            }
            className={`relative rounded-lg p-2 transition-colors ${
              isLyricsOpen || isFullScreenLyrics
                ? `${theme.bgClass} ${theme.textClass} shadow-[0_0_16px_rgba(255,255,255,0.2)]`
                : "text-zinc-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            <MicVocal className="h-4 w-4" />
            {hasLyrics && (
              <span
                aria-label="Có lời bài hát"
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#1DB954]"
              />
            )}
          </motion.button>

          <motion.button
            type="button"
            {...BUTTON_MOTION}
            onClick={toggleQueueOpen}
            aria-label="Danh sách phát"
            title="Danh sách phát (Queue)"
            className={`relative rounded-lg p-2 transition-colors ${
              isQueueOpen
                ? `${theme.bgClass} ${theme.textClass}`
                : "text-zinc-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            <ListMusic className="h-4 w-4" />
            {queue.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-800 px-1 font-mono text-[10px] tabular-nums text-zinc-200 ring-1 ring-white/15">
                {queue.length}
              </span>
            )}
          </motion.button>

          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              {...BUTTON_MOTION}
              onClick={toggleMute}
              aria-label={isMuted ? "Bật âm thanh" : "Tắt âm thanh"}
              className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:text-white"
            >
              {effectiveVolume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </motion.button>
            <div className="relative flex h-5 w-24 items-center">
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full w-full origin-left rounded-full bg-white"
                  style={{ transform: `scaleX(${effectiveVolume / 100})` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={effectiveVolume}
                aria-label="Âm lượng"
                onChange={(e) => setVolume(Number(e.target.value))}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
          </div>

          {currentTrack && (
            <motion.button
              type="button"
              {...BUTTON_MOTION}
              onClick={() => setFullPlayerOpen(true)}
              aria-label="Mở trình phát toàn màn hình"
              title="Trình phát toàn màn hình"
              className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Maximize2 className="h-4 w-4" />
            </motion.button>
          )}
        </div>
      </footer>
    </>
  );
}
