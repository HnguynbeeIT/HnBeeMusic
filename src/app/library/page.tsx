"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  FolderPlus,
  Heart,
  ListMusic,
  Pencil,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { usePlaylistStore } from "@/store/usePlaylistStore";
import { BUTTON_MOTION } from "@/lib/ui/source-theme";
import { TrackRow } from "@/components/track/TrackRow";
import { TrackThumbnail } from "@/components/track/TrackThumbnail";

export default function LibraryPage() {
  const likedTracks = usePlayerStore((s) => s.likedTracks);
  const queue = usePlayerStore((s) => s.queue);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const playlists = usePlaylistStore((s) => s.playlists);
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist);
  const renamePlaylist = usePlaylistStore((s) => s.renamePlaylist);
  const deletePlaylist = usePlaylistStore((s) => s.deletePlaylist);
  const removeTrackFromPlaylist = usePlaylistStore(
    (s) => s.removeTrackFromPlaylist
  );

  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const activePlaylist =
    playlists.find((p) => p.id === selectedId) ?? playlists[0] ?? null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const created = createPlaylist(newName.trim());
    setSelectedId(created.id);
    setNewName("");
  };

  const handleSaveRename = (id: string) => {
    if (editValue.trim()) {
      renamePlaylist(id, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="space-y-8">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Thư viện cá nhân
        </h1>
        <p className="text-sm text-zinc-400">
          Playlist đa nguồn (Spotify + YouTube + SoundCloud), bài hát đã thích
          và hàng đợi hiện tại.
        </p>
      </header>

      {/* CROSS-PLATFORM PERSONAL PLAYLISTS */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">
              Playlist của bạn ({playlists.length})
            </h2>
          </div>

          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tên playlist mới..."
              className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:border-white/25 focus:outline-none"
            />
            <motion.button
              type="submit"
              {...BUTTON_MOTION}
              disabled={!newName.trim()}
              className="rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-950 disabled:opacity-40"
            >
              + Tạo Playlist
            </motion.button>
          </form>
        </div>

        {playlists.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-8 text-center text-xs text-zinc-500 backdrop-blur-xl">
            Bạn chưa tạo playlist nào. Tạo một playlist mới ở trên hoặc bấm biểu
            tượng <strong className="text-zinc-300">+ Playlist</strong> trên bất
            kỳ bài hát nào để trộn nhạc từ Spotify, YouTube &amp; SoundCloud!
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Playlist Cards */}
            <div className="space-y-2">
              {playlists.map((pl) => {
                const isSelected = activePlaylist?.id === pl.id;
                const isEditing = editingId === pl.id;
                return (
                  <div
                    key={pl.id}
                    onClick={() => setSelectedId(pl.id)}
                    className={`group flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-colors ${
                      isSelected
                        ? "border-white/20 bg-white/10"
                        : "border-white/10 bg-zinc-900/50 hover:bg-zinc-900/80"
                    }`}
                  >
                    <TrackThumbnail
                      src={pl.tracks[0]?.thumbnail}
                      alt={pl.name}
                      className="h-11 w-11 rounded-lg"
                    />
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveRename(pl.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="w-full rounded-lg border border-white/20 bg-black/60 px-2 py-1 text-xs text-white focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRename(pl.id)}
                            className="rounded p-1 text-emerald-400 hover:bg-white/10"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded p-1 text-zinc-400 hover:bg-white/10"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="truncate text-sm font-medium text-white">
                            {pl.name}
                          </p>
                          <p className="font-mono text-[11px] tabular-nums text-zinc-400">
                            {pl.tracks.length} bài hát
                          </p>
                        </>
                      )}
                    </div>

                    {!isEditing && (
                      <div
                        className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(pl.id);
                            setEditValue(pl.name);
                          }}
                          aria-label="Đổi tên playlist"
                          className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deletePlaylist(pl.id)}
                          aria-label="Xóa playlist"
                          className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Active Playlist Track List */}
            {activePlaylist && (
              <div className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4 backdrop-blur-xl lg:col-span-2">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {activePlaylist.name}
                    </h3>
                    <p className="text-xs text-zinc-400">
                      {activePlaylist.tracks.length} bài hát đa nguồn
                    </p>
                  </div>
                  {activePlaylist.tracks.length > 0 && (
                    <motion.button
                      type="button"
                      {...BUTTON_MOTION}
                      onClick={() =>
                        playTrack(
                          activePlaylist.tracks[0],
                          activePlaylist.tracks
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-zinc-950"
                    >
                      <Play className="h-3.5 w-3.5 fill-zinc-950" />
                      Phát tất cả
                    </motion.button>
                  )}
                </div>

                {activePlaylist.tracks.length === 0 ? (
                  <p className="py-8 text-center text-xs text-zinc-500">
                    Playlist đang trống. Bấm biểu tượng + Playlist trên bất kỳ
                    bài hát nào để thêm vào đây.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {activePlaylist.tracks.map((track, idx) => (
                      <div
                        key={track.id}
                        className="flex items-center gap-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <TrackRow
                            track={track}
                            index={idx}
                            contextQueue={activePlaylist.tracks}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            removeTrackFromPlaylist(activePlaylist.id, track.id)
                          }
                          aria-label="Xóa khỏi playlist"
                          title="Xóa khỏi playlist"
                          className="rounded-lg p-2 text-zinc-500 hover:bg-white/10 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
