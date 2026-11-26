"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  FolderPlus,
  Heart,
  ListMusic,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { usePlaylistStore } from "@/store/usePlaylistStore";
import { BUTTON_MOTION } from "@/lib/ui/source-theme";
import { TrackRow } from "@/components/track/TrackRow";
import { PlaylistCover } from "@/components/playlist/PlaylistCover";

export default function LibraryPage() {
  const likedTracks = usePlayerStore((s) => s.likedTracks);
  const queue = usePlayerStore((s) => s.queue);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const playlists = usePlaylistStore((s) => s.playlists);
  const openCreateModal = usePlaylistStore((s) => s.openCreateModal);
  const deletePlaylist = usePlaylistStore((s) => s.deletePlaylist);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Thư viện cá nhân
          </h1>
          <p className="text-sm text-zinc-400">
            Quản lý Playlist đa nguồn (Spotify + YouTube + SoundCloud), bài hát
            đã thích và hàng đợi — tự động đồng bộ Server.
          </p>
        </div>

        <motion.button
          type="button"
          {...BUTTON_MOTION}
          onClick={() => openCreateModal()}
          className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 shadow-lg shadow-white/10 hover:bg-zinc-100"
        >
          <Plus className="h-4 w-4" />
          Tạo Playlist Mới
        </motion.button>
      </header>

      {/* CROSS-PLATFORM PERSONAL PLAYLISTS */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <FolderPlus className="h-4 w-4 text-emerald-400" />
          <h2 className="text-base font-semibold text-white">
            Playlists của bạn ({playlists.length})
          </h2>
        </div>

        {playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/15 bg-zinc-900/40 p-10 text-center backdrop-blur-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
              <FolderPlus className="h-6 w-6" />
            </div>
            <div className="max-w-md space-y-1">
              <p className="text-sm font-semibold text-white">
                Chưa có Playlist nào trong Thư viện
              </p>
              <p className="text-xs text-zinc-400">
                Tạo playlist mới hoặc dán trực tiếp link playlist công khai từ
                Spotify, YouTube, SoundCloud để lưu và nghe mọi lúc!
              </p>
            </div>
            <motion.button
              type="button"
              {...BUTTON_MOTION}
              onClick={() => openCreateModal()}
              className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              <Plus className="h-3.5 w-3.5" />
              Tạo / Import Playlist ngay
            </motion.button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {playlists.map((pl) => (
              <div
                key={pl.id}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/55 p-4 transition-colors hover:border-white/20 hover:bg-zinc-900/80"
              >
                <Link
                  href={`/library/playlist/${encodeURIComponent(pl.id)}`}
                  className="flex items-center gap-3.5"
                >
                  <div className="relative shrink-0">
                    <PlaylistCover
                      name={pl.name}
                      coverUrl={pl.coverUrl}
                      tracks={pl.tracks}
                      className="h-16 w-16 rounded-xl shadow-lg"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white group-hover:text-emerald-300">
                      {pl.name}
                    </p>
                    {pl.description && (
                      <p className="mt-0.5 truncate text-xs text-zinc-400">
                        {pl.description}
                      </p>
                    )}
                    <p className="mt-1 font-mono text-[11px] tabular-nums text-zinc-500">
                      {pl.tracks.length} bài hát
                    </p>
                  </div>
                </Link>

                <div className="mt-3.5 flex items-center justify-between border-t border-white/10 pt-3">
                  <Link
                    href={`/library/playlist/${encodeURIComponent(pl.id)}`}
                    className="text-xs font-medium text-zinc-300 hover:text-white"
                  >
                    Xem chi tiết →
                  </Link>
                  <div className="flex items-center gap-1.5">
                    {pl.tracks.length > 0 && (
                      <motion.button
                        type="button"
                        {...BUTTON_MOTION}
                        onClick={() => playTrack(pl.tracks[0], pl.tracks)}
                        aria-label={`Phát ${pl.name}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-950 shadow-md hover:bg-emerald-400"
                      >
                        <Play className="h-3.5 w-3.5 translate-x-[1px] fill-current" />
                      </motion.button>
                    )}
                    <button
                      type="button"
                      onClick={() => deletePlaylist(pl.id)}
                      aria-label={`Xóa ${pl.name}`}
                      title="Xóa playlist"
                      className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Liked Songs */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 fill-emerald-400 text-emerald-400" />
          <h2 className="text-base font-semibold text-white">
            Bài hát đã thích ({likedTracks.length})
          </h2>
        </div>

        {likedTracks.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-8 text-center text-xs text-zinc-500">
            Chưa có bài hát yêu thích nào. Hãy bấm biểu tượng trái tim trên bất
            kỳ bài hát nào để lưu lại.
          </div>
        ) : (
          <div className="space-y-1 rounded-2xl border border-white/10 bg-zinc-900/40 p-2 backdrop-blur-xl">
            {likedTracks.map((track, idx) => (
              <TrackRow
                key={track.id}
                track={track}
                index={idx}
                contextQueue={likedTracks}
              />
            ))}
          </div>
        )}
      </section>

      {/* Current Queue */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ListMusic className="h-4 w-4 text-zinc-400" />
          <h2 className="text-base font-semibold text-white">
            Hàng đợi đang mở ({queue.length})
          </h2>
        </div>

        {queue.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-8 text-center text-xs text-zinc-500">
            Hàng đợi đang trống.
          </div>
        ) : (
          <div className="space-y-1 rounded-2xl border border-white/10 bg-zinc-900/40 p-2 backdrop-blur-xl">
            {queue.map((track, idx) => (
              <TrackRow
                key={`${track.id}-${idx}`}
                track={track}
                index={idx}
                contextQueue={queue}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
