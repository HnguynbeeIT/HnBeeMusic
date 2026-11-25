"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Disc3, MicVocal, X } from "lucide-react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { SAMPLE_LYRICS } from "@/lib/adapters/fallback-catalog";
import {
  BUTTON_MOTION,
  DRAWER_EASE,
  getSourceTheme,
} from "@/lib/ui/source-theme";
import { SourceBadge } from "@/components/track/SourceBadge";

export function LyricsDrawer() {
  const isOpen = usePlayerStore((s) => s.isLyricsOpen);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const setLyricsOpen = usePlayerStore((s) => s.setLyricsOpen);

  const lines = currentTrack ? SAMPLE_LYRICS[currentTrack.id] : undefined;
  const theme = getSourceTheme(currentTrack?.source);
  const activeLineIndex =
    lines && duration > 0
      ? Math.min(
          lines.length - 1,
          Math.floor((progress / duration) * lines.length)
        )
      : 0;

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
            className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-zinc-900/75 pb-28 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <MicVocal className={`h-4 w-4 ${theme.textClass}`} />
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Lời bài hát
                  </h2>
                  {currentTrack && (
                    <p className="max-w-[230px] truncate text-xs text-zinc-400">
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

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {!currentTrack ? (
                <div className="flex h-60 flex-col items-center justify-center text-center text-xs text-zinc-500">
                  <Disc3 className="mb-3 h-8 w-8 text-zinc-600" />
                  <p>Hãy chọn một bài hát để xem lời bài hát.</p>
                </div>
              ) : lines && lines.length > 0 ? (
                <div className="space-y-4">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-xs text-zinc-400">
                      {currentTrack.artist}
                    </span>
                    <SourceBadge
                      source={currentTrack.source}
                      resolvedSource={currentTrack.resolvedSource}
                    />
                  </div>
                  {lines.map((line, i) => {
                    const isActive = i === activeLineIndex;
                    return (
                      <p
                        key={i}
                        className={`text-lg font-semibold leading-relaxed transition-all duration-300 ${
                          isActive
                            ? "scale-[1.02] text-white"
                            : i < activeLineIndex
                            ? "text-zinc-500"
                            : "text-zinc-400/75"
                        }`}
                      >
                        {line}
                      </p>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-64 flex-col items-center justify-center text-center">
                  <div
                    className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 ${theme.bgClass}`}
                  >
                    <MicVocal className={`h-6 w-6 ${theme.textClass}`} />
                  </div>
                  <p className="text-sm font-medium text-zinc-200">
                    Bản nhạc không lời hoặc chưa có lời đồng bộ
                  </p>
                  <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-zinc-500">
                    Đang phát &ldquo;{currentTrack.title}&rdquo; của{" "}
                    {currentTrack.artist}. Thư giãn và tận hưởng âm thanh nhé!
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
