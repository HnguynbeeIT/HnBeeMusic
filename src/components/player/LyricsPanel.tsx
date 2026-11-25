"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Disc3, MicVocal, Sparkles, X } from "lucide-react";
import type { LyricsResult } from "@/lib/lyrics";
import { usePlayerStore } from "@/store/usePlayerStore";
import {
  BUTTON_MOTION,
  DRAWER_EASE,
  getSourceTheme,
} from "@/lib/ui/source-theme";
import { SourceBadge } from "@/components/track/SourceBadge";

export function LyricsPanel() {
  const isOpen = usePlayerStore((s) => s.isLyricsOpen);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const setLyricsOpen = usePlayerStore((s) => s.setLyricsOpen);
  const seekTo = usePlayerStore((s) => s.seekTo);

  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  const theme = getSourceTheme(currentTrack?.source);

  // Fetch synced/plain lyrics from /api/lyrics (LRCLIB) when track changes
  useEffect(() => {
    if (!currentTrack) {
      setLyrics(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setLyrics(null);

    const params = new URLSearchParams({
      id: currentTrack.id,
      title: currentTrack.title,
      artist: currentTrack.artist,
      duration: String(Math.round(currentTrack.duration || duration || 0)),
    });

    fetch(`/api/lyrics?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: LyricsResult) => {
        setLyrics(data);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLyrics({ synced: [], plain: null, instrumental: false, source: "none" });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.artist]);

  // Determine current active synced lyric line index
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

  // Smoothly auto-scroll active synced line to center of viewport
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    activeLineRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeIndex, isOpen]);

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
            className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-zinc-900/80 pb-28 shadow-2xl backdrop-blur-2xl"
          >
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
                        LRCLIB Sync
                      </span>
                    )}
                  </div>
                  {currentTrack && (
                    <p className="max-w-[250px] truncate text-xs text-zinc-400">
                      {currentTrack.title}
                    </p>
                  )}
                </div>
              </div>

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

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
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
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-xs text-zinc-400">
                      {currentTrack.artist} · Bấm vào dòng bất kỳ để tua
                    </span>
                    <SourceBadge
                      source={currentTrack.source}
                      resolvedSource={currentTrack.resolvedSource}
                    />
                  </div>

                  {lyrics.synced.map((line, i) => {
                    const isActive = i === activeIndex;
                    const isPast = i < activeIndex;
                    return (
                      <button
                        key={`${line.time}-${i}`}
                        ref={isActive ? activeLineRef : undefined}
                        type="button"
                        onClick={() => seekTo(line.time)}
                        className={`block w-full origin-left text-left text-lg font-semibold leading-relaxed transition-all duration-300 ${
                          isActive
                            ? "scale-[1.03] text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.4)]"
                            : isPast
                            ? "text-zinc-500/75 hover:text-zinc-300"
                            : "text-zinc-400/65 hover:text-zinc-200"
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
                    <span className="text-xs text-zinc-400">
                      {currentTrack.artist} · Lời tĩnh
                    </span>
                    <SourceBadge
                      source={currentTrack.source}
                      resolvedSource={currentTrack.resolvedSource}
                    />
                  </div>
                  {lyrics.plain.split(/\r?\n/).map((line, i) => (
                    <p
                      key={i}
                      className="text-base font-medium leading-relaxed text-zinc-200"
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
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
