"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownCircle,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  MicVocal,
  Minimize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Sparkles,
  X,
} from "lucide-react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { usePlaybackTimeStore } from "@/store/usePlaybackTimeStore";
import {
  useLyricsStore,
  type LyricsFontSize,
} from "@/store/useLyricsStore";
import {
  BUTTON_MOTION,
  SPRING_PHYSICS,
  getSourceTheme,
} from "@/lib/ui/source-theme";
import { TrackThumbnail } from "@/components/track/TrackThumbnail";
import { SourceBadge } from "@/components/track/SourceBadge";
import { ArtistLink } from "@/components/artist/ArtistLink";
import { PlayerSeekBar } from "./PlayerSeekBar";

const KARAOKE_FONT_CLASSES: Record<LyricsFontSize, string> = {
  sm: "text-xl sm:text-2xl leading-relaxed",
  md: "text-2xl sm:text-3xl leading-snug",
  lg: "text-3xl sm:text-4xl leading-snug",
};

const FONT_OPTIONS: Array<{ id: LyricsFontSize; label: string }> = [
  { id: "sm", label: "Nhỏ" },
  { id: "md", label: "Vừa" },
  { id: "lg", label: "Lớn" },
];

export function FullScreenLyricsModal() {
  const isOpen = useLyricsStore((s) => s.isFullScreenLyrics);
  const lyrics = useLyricsStore((s) => s.lyrics);
  const loading = useLyricsStore((s) => s.loading);
  const fontSize = useLyricsStore((s) => s.fontSize);
  const setFontSize = useLyricsStore((s) => s.setFontSize);
  const setFullScreenLyrics = useLyricsStore((s) => s.setFullScreenLyrics);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  // Zero re-renders when FullScreenLyricsModal is closed!
  const progress = usePlaybackTimeStore((s) => (isOpen ? s.progress : 0));
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrev = usePlayerStore((s) => s.playPrev);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const setLyricsOpen = usePlayerStore((s) => s.setLyricsOpen);

  const [userScrolling, setUserScrolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const swipeStartYRef = useRef<number | null>(null);

  const theme = getSourceTheme(currentTrack?.source);

  // Close Full-Screen Lyrics with Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullScreenLyrics(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, setFullScreenLyrics]);

  const handleHeaderTouchStart = (e: React.TouchEvent) => {
    swipeStartYRef.current = e.touches[0]?.clientY ?? null;
  };

  const handleHeaderTouchEnd = (e: React.TouchEvent) => {
    const startY = swipeStartYRef.current;
    swipeStartYRef.current = null;
    const endY = e.changedTouches[0]?.clientY;
    if (startY !== null && typeof endY === "number" && endY - startY > 56) {
      setFullScreenLyrics(false);
    }
  };

  const activeIndex = useMemo(() => {
    if (!lyrics?.synced?.length) return -1;
    let idx = -1;
    for (let i = 0; i < lyrics.synced.length; i++) {
      if (progress + 0.25 >= lyrics.synced[i].time) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [lyrics, progress]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0 || userScrolling) return;
    activeLineRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeIndex, isOpen, userScrolling]);

  useEffect(() => {
    setUserScrolling(false);
  }, [currentTrack?.id, isOpen]);

  const handleCopyLyrics = async () => {
    if (!lyrics) return;
    const text =
      lyrics.synced.length > 0
        ? lyrics.synced.map((l) => l.text).join("\n")
        : lyrics.plain || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <AnimatePresence>
      {isOpen && currentTrack && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.25 }}
          role="dialog"
          aria-modal="true"
          aria-label="Lời bài hát Karaoke toàn màn hình"
          className="fixed inset-0 z-[9999] flex flex-col bg-[#09090b]/96 backdrop-blur-3xl"
        >
          {/* Dynamic Ambient Cover Backdrop */}
          {currentTrack.thumbnail && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center opacity-30 blur-[130px] transition-all duration-1000"
              style={{ backgroundImage: `url(${currentTrack.thumbnail})` }}
            />
          )}

          {/* Fixed Safe-Area Top Bar (Dynamic Island / Notch safe + Swipe Down + 48x48px Close button) */}
          <div
            onTouchStart={handleHeaderTouchStart}
            onTouchEnd={handleHeaderTouchEnd}
            className="pointer-events-auto sticky top-0 z-30 border-b border-white/10 bg-[#09090b]/80 px-4 pb-3 pt-[max(env(safe-area-inset-top),16px)] backdrop-blur-xl sm:px-8"
          >
            <div
              aria-hidden="true"
              className="mx-auto mb-2.5 h-1.5 w-10 rounded-full bg-white/25 md:hidden"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <MicVocal className={`h-4 w-4 shrink-0 ${theme.textClass}`} />
                <span className="truncate text-sm font-semibold text-white">
                  Karaoke Lyrics
                </span>
                {lyrics?.synced && lyrics.synced.length > 0 && (
                  <span className="hidden items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400 sm:inline-flex">
                    <Sparkles className="h-3 w-3" />
                    LRCLIB Real-time Sync
                  </span>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {/* Font size switcher */}
                <div className="hidden items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1 sm:inline-flex">
                  {FONT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFontSize(opt.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                        fontSize === opt.id
                          ? "bg-white/15 text-white"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {(lyrics?.synced.length || lyrics?.plain) && (
                  <motion.button
                    type="button"
                    {...BUTTON_MOTION}
                    onClick={() => void handleCopyLyrics()}
                    className="hidden items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-white/10 sm:inline-flex"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        Đã chép
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy Lyrics
                      </>
                    )}
                  </motion.button>
                )}

                <motion.button
                  type="button"
                  {...BUTTON_MOTION}
                  onClick={() => {
                    setFullScreenLyrics(false);
                    setLyricsOpen(true);
                  }}
                  aria-label="Thu gọn về Side Drawer"
                  title="Thu gọn về cửa sổ trượt"
                  className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-zinc-200 hover:bg-white/20 hover:text-white"
                >
                  <Minimize2 className="h-4 w-4" />
                </motion.button>

                <motion.button
                  type="button"
                  {...BUTTON_MOTION}
                  onClick={() => setFullScreenLyrics(false)}
                  aria-label="Đóng toàn màn hình"
                  title="Đóng lời bài hát"
                  className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-white shadow-lg hover:bg-white/25"
                >
                  <ChevronDown className="h-6 w-6 md:hidden" />
                  <X className="hidden h-5 w-5 md:block" />
                </motion.button>
              </div>
            </div>
          </div>

          {/* Main Split Layout: Left Artwork+Controls | Right Full Karaoke Lyrics */}
          <div className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 gap-8 overflow-hidden px-5 py-6 sm:px-8 lg:grid-cols-12">
            {/* Left Column: Artwork & Compact Transport */}
            <div className="hidden flex-col items-center justify-center lg:col-span-4 lg:flex">
              <motion.div
                animate={{ scale: isPlaying ? 1.04 : 1 }}
                transition={SPRING_PHYSICS}
                style={{ boxShadow: isPlaying ? theme.glowShadow : undefined }}
                className="aspect-square w-full max-w-[300px] rounded-3xl shadow-2xl shadow-black/70"
              >
                <TrackThumbnail
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className="h-full w-full rounded-3xl"
                />
              </motion.div>

              <div className="mt-6 w-full max-w-[300px] text-center">
                <h2 className="truncate text-xl font-bold text-white">
                  {currentTrack.title}
                </h2>
                <div className="mt-1.5 flex items-center justify-center gap-2">
                  <ArtistLink
                    name={currentTrack.artist}
                    source={currentTrack.source}
                    onNavigate={() => setFullScreenLyrics(false)}
                    className="text-sm text-zinc-300"
                  />
                  <SourceBadge
                    source={currentTrack.source}
                    resolvedSource={currentTrack.resolvedSource}
                  />
                </div>
              </div>

              <div className="mt-6 w-full max-w-[300px]">
                <PlayerSeekBar
                  source={currentTrack.source}
                  onSeek={seekTo}
                />
              </div>

              <div className="mt-5 flex items-center gap-5">
                <motion.button
                  type="button"
                  {...BUTTON_MOTION}
                  onClick={playPrev}
                  aria-label="Bài trước"
                  className="p-2 text-zinc-300 hover:text-white"
                >
                  <SkipBack className="h-6 w-6 fill-current" />
                </motion.button>

                <motion.button
                  type="button"
                  {...BUTTON_MOTION}
                  onClick={togglePlay}
                  aria-label={isPlaying ? "Tạm dừng" : "Phát"}
                  style={{ boxShadow: isPlaying ? theme.glowShadow : undefined }}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-zinc-950 shadow-xl"
                >
                  {isLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="h-6 w-6 fill-zinc-950" />
                  ) : (
                    <Play className="h-6 w-6 translate-x-[2px] fill-zinc-950" />
                  )}
                </motion.button>

                <motion.button
                  type="button"
                  {...BUTTON_MOTION}
                  onClick={() => playNext(false)}
                  aria-label="Bài tiếp theo"
                  className="p-2 text-zinc-300 hover:text-white"
                >
                  <SkipForward className="h-6 w-6 fill-current" />
                </motion.button>
              </div>
            </div>

            {/* Right Column: Karaoke Lyrics Stream */}
            <div className="relative flex min-h-0 flex-col lg:col-span-8">
              <div
                onWheel={() => {
                  if (lyrics?.synced?.length) setUserScrolling(true);
                }}
                onTouchMove={() => {
                  if (lyrics?.synced?.length) setUserScrolling(true);
                }}
                className="flex-1 overflow-y-auto px-2 py-8 sm:px-6"
              >
                {loading ? (
                  <div className="space-y-6 animate-pulse">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-8 rounded-xl bg-white/10 ${
                          i % 2 === 0 ? "w-3/4" : "w-1/2"
                        }`}
                      />
                    ))}
                  </div>
                ) : lyrics?.synced && lyrics.synced.length > 0 ? (
                  <div className="space-y-6 pb-36 pt-6">
                    {lyrics.synced.map((line, i) => {
                      const isActive = i === activeIndex;
                      return (
                        <button
                          key={`${line.time}-${i}`}
                          ref={isActive ? activeLineRef : undefined}
                          type="button"
                          onClick={() => {
                            setUserScrolling(false);
                            seekTo(line.time);
                          }}
                          className={`block w-full origin-left text-left transition-all duration-300 ${
                            KARAOKE_FONT_CLASSES[fontSize]
                          } ${
                            isActive
                              ? "scale-105 font-bold text-white drop-shadow-[0_0_24px_rgba(255,255,255,0.45)]"
                              : "font-semibold text-white/40 blur-[0.3px] hover:text-white/85 hover:blur-0"
                          }`}
                        >
                          {line.text}
                        </button>
                      );
                    })}
                  </div>
                ) : lyrics?.plain ? (
                  <div className="space-y-4 pb-24">
                    {lyrics.plain.split(/\r?\n/).map((line, i) => (
                      <p
                        key={i}
                        className={`font-semibold text-zinc-200 ${KARAOKE_FONT_CLASSES[fontSize]}`}
                      >
                        {line || "\u00A0"}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <MicVocal className={`mb-4 h-10 w-10 ${theme.textClass}`} />
                    <p className="text-lg font-semibold text-white">
                      {lyrics?.instrumental
                        ? "Bản nhạc không lời (Instrumental)"
                        : "Chưa có lời cho bài hát này"}
                    </p>
                    <p className="mt-2 max-w-md text-sm text-zinc-400">
                      LRCLIB hiện chưa có dữ liệu lời cho &ldquo;
                      {currentTrack.title}&rdquo;.
                    </p>
                  </div>
                )}
              </div>

              <AnimatePresence>
                {userScrolling && activeIndex >= 0 && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    onClick={() => {
                      setUserScrolling(false);
                      activeLineRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }}
                    className="absolute bottom-6 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-zinc-900/90 px-5 py-2.5 text-xs font-semibold text-white shadow-2xl backdrop-blur-xl hover:bg-white hover:text-zinc-950"
                  >
                    <ArrowDownCircle className="h-4 w-4" />
                    Quay lại câu đang hát
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
