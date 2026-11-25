"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Trash2, X } from "lucide-react";
import { usePlayerStore } from "@/store/usePlayerStore";
import {
  BUTTON_MOTION,
  DRAWER_EASE,
  getSourceTheme,
} from "@/lib/ui/source-theme";
import { TrackThumbnail } from "@/components/track/TrackThumbnail";
import { SourceBadge } from "@/components/track/SourceBadge";
import { AudioEqualizer } from "@/components/track/AudioEqualizer";

export function QueueDrawer() {
  const isOpen = usePlayerStore((s) => s.isQueueOpen);
  const queue = usePlayerStore((s) => s.queue);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setQueueOpen = usePlayerStore((s) => s.setQueueOpen);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);
  const clearQueue = usePlayerStore((s) => s.clearQueue);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setQueueOpen(false)}
            className="fixed inset-0 bg-black/55 backdrop-blur-xs"
          />

          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.36, ease: DRAWER_EASE }}
            className="relative z-10 flex h-full w-full max-w-sm flex-col border-l border-white/10 bg-zinc-900/75 pb-28 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Danh sách phát
                </h2>
                <p className="font-mono text-xs tabular-nums text-zinc-400">
                  {queue.length} bài hát
                </p>
              </div>
              <div className="flex items-center gap-1">
                {queue.length > 1 && (
                  <motion.button
                    type="button"
                    {...BUTTON_MOTION}
                    onClick={clearQueue}
                    className="rounded-lg px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-white"
                  >
                    Xóa chờ
                  </motion.button>
                )}
                <motion.button
                  type="button"
                  {...BUTTON_MOTION}
                  onClick={() => setQueueOpen(false)}
                  aria-label="Đóng danh sách phát"
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {queue.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-center text-xs text-zinc-500">
                  <p>Hàng đợi đang trống.</p>
                  <p className="mt-1 text-zinc-600">
                    Chọn bài hát hoặc dán link để bắt đầu phát.
                  </p>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {queue.map((track, idx) => {
                    const isCurrent = currentTrack?.id === track.id;
                    const theme = getSourceTheme(track.source);
                    return (
                      <li
                        key={`${track.id}-${idx}`}
                        onClick={() => playTrack(track)}
                        className={`group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors ${
                          isCurrent
                            ? "border border-white/15 bg-white/10"
                            : "hover:bg-white/5"
                        }`}
                      >
                        <TrackThumbnail
                          src={track.thumbnail}
                          alt={track.title}
                          className="h-10 w-10 rounded-md"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {isCurrent && (
                              <AudioEqualizer
                                playing={isPlaying}
                                source={track.source}
                                className="h-3 w-3 shrink-0"
                              />
                            )}
                            <p
                              className={`truncate text-xs font-medium ${
                                isCurrent ? theme.textClass : "text-zinc-100"
                              }`}
                            >
                              {track.title}
                            </p>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <p className="truncate text-[11px] text-zinc-400">
                              {track.artist}
                            </p>
                            <SourceBadge
                              source={track.source}
                              resolvedSource={track.resolvedSource}
                              compact
                            />
                          </div>
                        </div>

                        {!isCurrent && (
                          <motion.button
                            type="button"
                            {...BUTTON_MOTION}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromQueue(idx);
                            }}
                            aria-label="Xóa khỏi hàng đợi"
                            className="rounded-lg p-1.5 text-zinc-500 opacity-0 transition-opacity hover:bg-white/10 hover:text-rose-400 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </motion.button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
