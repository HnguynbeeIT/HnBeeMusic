"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownCircle,
  Check,
  Copy,
  Disc3,
  Maximize2,
  MicVocal,
  Sparkles,
  X,
} from "lucide-react";
import { usePlayerStore } from "@/store/usePlayerStore";
import {
  useLyricsStore,
  type LyricsFontSize,
} from "@/store/useLyricsStore";
import {
  BUTTON_MOTION,
  DRAWER_EASE,
  getSourceTheme,
} from "@/lib/ui/source-theme";
import { SourceBadge } from "@/components/track/SourceBadge";
import { ArtistLink } from "@/components/artist/ArtistLink";

const FONT_SIZE_CLASSES: Record<LyricsFontSize, string> = {
  sm: "text-base leading-relaxed",
  md: "text-lg leading-relaxed",
  lg: "text-2xl leading-snug",
};

const FONT_OPTIONS: Array<{ id: LyricsFontSize; label: string }> = [
  { id: "sm", label: "Nhỏ" },
  { id: "md", label: "Vừa" },
  { id: "lg", label: "Lớn" },
];

export function LyricsPanel() {
  const isOpen = usePlayerStore((s) => s.isLyricsOpen);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const setLyricsOpen = usePlayerStore((s) => s.setLyricsOpen);
  const seekTo = usePlayerStore((s) => s.seekTo);

  const lyrics = useLyricsStore((s) => s.lyrics);
  const loading = useLyricsStore((s) => s.loading);
  const fontSize = useLyricsStore((s) => s.fontSize);
  const setFontSize = useLyricsStore((s) => s.setFontSize);
  const setFullScreenLyrics = useLyricsStore((s) => s.setFullScreenLyrics);
  const fetchForTrack = useLyricsStore((s) => s.fetchForTrack);

  const [userScrolling, setUserScrolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  const theme = getSourceTheme(currentTrack?.source);

  // Automatically prefetch lyrics whenever currentTrack changes (drives BottomPlayerBar indicator dot)
  useEffect(() => {
    void fetchForTrack(currentTrack, duration);
    setUserScrolling(false);
  }, [currentTrack?.id, fetchForTrack]);

  // Active synced line index
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

  // Auto-scroll smoothly unless user is manually scrolling
  useEffect(() => {
    if (!isOpen || activeIndex < 0 || userScrolling) return;
    activeLineRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeIndex, isOpen, userScrolling]);

  const handleReturnToActive = () => {
    setUserScrolling(false);
    activeLineRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

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

  const hasText = Boolean(lyrics?.synced.length || lyrics?.plain);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setLyricsOpen(false)}
            className="fixed inset-0 bg-black/55 backdrop-blur-xs"
          />

          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.36, ease: DRAWER_EASE }}
            className="relative z-10 flex h-full w-full max-w-md flex-col overflow-hidden border-l border-white/10 bg-zinc-950/85 pb-28 shadow-2xl backdrop-blur-3xl"
          >
            {/* Dynamic cover-tinted glow behind drawer */}
            {currentTrack?.thumbnail && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center opacity-20 blur-[100px]"
                style={{ backgroundImage: `url(${currentTrack.thumbnail})` }}
              />
            )}

            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <MicVocal className={`h-4 w-4 shrink-0 ${theme.textClass}`} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-white">
                      Synced Lyrics
                    </h2>
                    {lyrics?.synced && lyrics.synced.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                        <Sparkles className="h-2.5 w-2.5" />
                        LRCLIB
                      </span>
                    )}
                  </div>
                  {currentTrack && (
                    <p className="max-w-[210px] truncate text-xs text-zinc-400">
                      {currentTrack.title}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {currentTrack && (
                  <motion.button
                    type="button"
                    {...BUTTON_MOTION}
                    onClick={() => {
                      setLyricsOpen(false);
                      setFullScreenLyrics(true);
                    }}
                    aria-label="Mở chế độ Karaoke toàn màn hình"
                    title="Toàn màn hình (Karaoke Mode)"
                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </motion.button>
                )}
                <motion.button
                  type="button"
                  {...BUTTON_MOTION}
                  onClick={() => setLyricsOpen(false)}
                  aria-label="Đóng lời bài hát"
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              </div>
            </div>

            {/* Utility Bar: Font Size + Copy Lyrics */}
            {currentTrack && hasText && (
              <div className="flex items-center justify-between border-b border-white/[0.06] bg-black/20 px-5 py-2">
                <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 p-0.5">
                  {FONT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFontSize(opt.id)}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        fontSize === opt.id
                          ? "bg-white/15 text-white"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => void handleCopyLyrics()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      Đã chép
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy Lyrics
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Scrollable Lyrics Viewport */}
            <div
              onWheel={() => {
                if (lyrics?.synced?.length) setUserScrolling(true);
              }}
              onTouchMove={() => {
                if (lyrics?.synced?.length) setUserScrolling(true);
              }}
              className="relative flex-1 overflow-y-auto px-6 py-6"
            >
              {!currentTrack ? (
                <div className="flex h-60 flex-col items-center justify-center text-center text-xs text-zinc-500">
                  <Disc3 className="mb-3 h-8 w-8 text-zinc-600" />
                  <p>Hãy chọn một bài hát để xem lời bài hát đồng bộ.</p>
                </div>
              ) : loading ? (
                <div className="space-y-4 animate-pulse pt-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-5 rounded-lg bg-white/10 ${
                        i % 2 === 0 ? "w-4/5" : "w-3/5"
                      }`}
                    />
                  ))}
                </div>
              ) : lyrics?.synced && lyrics.synced.length > 0 ? (
                <div className="space-y-4 pb-24 pt-2">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-400">
                      <ArtistLink
                        name={currentTrack.artist}
                        source={currentTrack.source}
                        onNavigate={() => setLyricsOpen(false)}
                        className="text-zinc-300"
                      />
                      <span className="shrink-0">· Bấm dòng để tua</span>
                    </span>
                    <SourceBadge
                      source={currentTrack.source}
                      resolvedSource={currentTrack.resolvedSource}
                    />
                  </div>

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
                          FONT_SIZE_CLASSES[fontSize]
                        } ${
                          isActive
                            ? "scale-105 font-bold text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.45)]"
                            : "font-medium text-white/40 blur-[0.3px] hover:text-white/85 hover:blur-0"
                        }`}
                      >
                        {line.text}
                      </button>
                    );
                  })}
                </div>
              ) : lyrics?.plain ? (
                <div className="space-y-3 pb-16">
                  <div className="mb-4 flex items-center justify-between">
                    <ArtistLink
                      name={currentTrack.artist}
                      source={currentTrack.source}
                      onNavigate={() => setLyricsOpen(false)}
                      className="text-xs text-zinc-300"
                    />
                    <SourceBadge
                      source={currentTrack.source}
                      resolvedSource={currentTrack.resolvedSource}
                    />
                  </div>
                  {lyrics.plain.split(/\r?\n/).map((line, i) => (
                    <p
                      key={i}
                      className={`font-medium text-zinc-200 ${FONT_SIZE_CLASSES[fontSize]}`}
                    >
                      {line || "\u00A0"}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="flex h-64 flex-col items-center justify-center text-center">
                  <div
                    className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 ${theme.bgClass}`}
                  >
                    <MicVocal className={`h-6 w-6 ${theme.textClass}`} />
                  </div>
                  <p className="text-sm font-medium text-zinc-200">
                    {lyrics?.instrumental
                      ? "Bản nhạc không lời (Instrumental)"
                      : "Chưa có lời cho bài hát này"}
                  </p>
                  <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-zinc-500">
                    LRCLIB hiện chưa có dữ liệu lời cho &ldquo;{currentTrack.title}
                    &rdquo;. Thư giãn và tận hưởng âm thanh nhé!
                  </p>
                </div>
              )}
            </div>

            {/* Floating "Return to current line" button when user scrolls manually */}
            <AnimatePresence>
              {userScrolling && activeIndex >= 0 && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  onClick={handleReturnToActive}
                  className="absolute bottom-32 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/20 bg-zinc-900/90 px-4 py-2 text-xs font-semibold text-white shadow-2xl backdrop-blur-xl hover:bg-white hover:text-zinc-950"
                >
                  <ArrowDownCircle className="h-3.5 w-3.5" />
                  Quay lại câu đang hát
                </motion.button>
              )}
            </AnimatePresence>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
