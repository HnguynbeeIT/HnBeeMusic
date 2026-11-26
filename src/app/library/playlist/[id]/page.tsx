"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Pencil,
  Play,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { usePlaylistStore } from "@/store/usePlaylistStore";
import { useAuthStore } from "@/store/useAuthStore";
import { BUTTON_MOTION } from "@/lib/ui/source-theme";
import { formatDuration } from "@/lib/audio/normalize";
import { safeDecodeParam } from "@/lib/audio/sanitize";
import { TrackRow } from "@/components/track/TrackRow";
import { PlaylistCover } from "@/components/playlist/PlaylistCover";

export default function PlaylistDetailPage() {
  const params = useParams<{ id?: string | string[] }>();
  const rawId = Array.isArray(params?.id) ? params.id[0] || "" : params?.id || "";
  const playlistId = safeDecodeParam(rawId);
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const isHydrating = useAuthStore((s) => s.isHydrating);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const playlists = usePlaylistStore((s) => s.playlists);
  const updatePlaylist = usePlaylistStore((s) => s.updatePlaylist);
  const deletePlaylist = usePlaylistStore((s) => s.deletePlaylist);
  const removeTrackFromPlaylist = usePlaylistStore(
    (s) => s.removeTrackFromPlaylist
  );
  const reorderTrackInPlaylist = usePlaylistStore(
    (s) => s.reorderTrackInPlaylist
  );

  const safePlaylists = Array.isArray(playlists) ? playlists : [];
  const playlist = safePlaylists.find(
    (p) =>
      p?.id === playlistId ||
      p?.id === rawId ||
      safeDecodeParam(p?.id) === playlistId
  );

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Prevent hydration mismatch & show clean Skeleton while loading from localStorage / Server
  if (!mounted || (isHydrating && !playlist)) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
        <div className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-zinc-900/60 p-6 sm:flex-row sm:items-end">
          <div className="h-40 w-40 shrink-0 animate-pulse rounded-2xl bg-white/10 sm:h-44 sm:w-44" />
          <div className="flex-1 space-y-3">
            <div className="h-3 w-36 animate-pulse rounded bg-white/10" />
            <div className="h-8 w-64 animate-pulse rounded-lg bg-white/10" />
            <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
            <div className="flex gap-2 pt-2">
              <div className="h-9 w-28 animate-pulse rounded-full bg-white/10" />
              <div className="h-9 w-24 animate-pulse rounded-full bg-white/10" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-3xl border border-white/10 bg-zinc-900/60 p-8 text-center backdrop-blur-xl">
        <p className="text-base font-semibold text-white">
          Không tìm thấy Playlist này
        </p>
        <p className="text-xs leading-relaxed text-zinc-400">
          Playlist có thể đã bị xóa hoặc thuộc tài khoản khác chưa đăng nhập.
        </p>
        <Link
          href="/library"
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Quay lại Thư viện
        </Link>
      </div>
    );
  }

  const tracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
  const totalSeconds = tracks.reduce(
    (sum, t) => sum + (Number.isFinite(t?.duration) ? t.duration : 0),
    0
  );

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    playTrack(tracks[0], tracks);
  };

  const handleShufflePlay = () => {
    if (tracks.length === 0) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  };

  const handleStartEdit = () => {
    setEditName(playlist.name);
    setEditDesc(playlist.description || "");
    setEditing(true);
  };

  const handleSaveEdit = () => {
    if (editName.trim()) {
      updatePlaylist(playlist.id, {
        name: editName.trim(),
        description: editDesc.trim(),
      });
    }
    setEditing(false);
  };

  const handleDelete = () => {
    deletePlaylist(playlist.id);
    router.push("/library");
  };

  return (
    <div className="space-y-6">
      <Link
        href="/library"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Quay lại Thư viện
      </Link>

      {/* Hero Header */}
      <section className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-zinc-900/60 p-6 shadow-2xl backdrop-blur-xl sm:flex-row sm:items-end">
        <PlaylistCover
          name={playlist.name}
          coverUrl={playlist.coverUrl}
          tracks={tracks}
          className="h-40 w-40 shrink-0 rounded-2xl shadow-2xl shadow-black/60 sm:h-44 sm:w-44"
        />

        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
            Playlist Cá Nhân • Đa nguồn
          </p>

          {editing ? (
            <div className="space-y-2">
              <input
                type="text"
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") setEditing(false);
                }}
                className="w-full rounded-xl border border-white/20 bg-black/50 px-3 py-2 text-lg font-bold text-white focus:border-emerald-400/60 focus:outline-none"
              />
              <input
                type="text"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Mô tả ngắn..."
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-zinc-200 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950"
                >
                  <Check className="h-3.5 w-3.5" /> Lưu
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300"
                >
                  <X className="h-3.5 w-3.5" /> Hủy
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {playlist.name}
              </h1>
              {playlist.description && (
                <p className="text-sm text-zinc-300">{playlist.description}</p>
              )}
              <p className="font-mono text-xs tabular-nums text-zinc-400">
                {tracks.length} bài hát
                {totalSeconds > 0 ? ` • ${formatDuration(totalSeconds)}` : ""}
              </p>
            </>
          )}

          {/* Action Bar */}
          {!editing && (
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <motion.button
                type="button"
                {...BUTTON_MOTION}
                disabled={tracks.length === 0}
                onClick={handlePlayAll}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-zinc-950 shadow-lg hover:bg-zinc-100 disabled:opacity-40"
              >
                <Play className="h-4 w-4 fill-zinc-950" />
                Phát tất cả
              </motion.button>

              <motion.button
                type="button"
                {...BUTTON_MOTION}
                disabled={tracks.length < 2}
                onClick={handleShufflePlay}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-40"
              >
                <Shuffle className="h-3.5 w-3.5" />
                Trộn bài
              </motion.button>

              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={handleStartEdit}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-white/10 hover:text-white"
              >
                <Pencil className="h-3.5 w-3.5" />
                Sửa tên
              </motion.button>

              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={handleDelete}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/25 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Xóa Playlist
              </motion.button>
            </div>
          )}
        </div>
      </section>

      {/* Tracks List with Reorder & Remove */}
      <section className="rounded-3xl border border-white/10 bg-zinc-900/45 p-3 backdrop-blur-xl sm:p-4">
        {tracks.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            Playlist đang trống. Bấm biểu tượng{" "}
            <strong className="text-zinc-300">+ Thêm vào Playlist</strong> trên
            bất kỳ bài hát nào ở Tìm kiếm, Khám phá hoặc Trending để thêm vào
            đây.
          </div>
        ) : (
          <div className="space-y-1">
            {tracks.map((track, idx) => (
              <div key={`${track.id}-${idx}`} className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <TrackRow
                    track={track}
                    index={idx}
                    contextQueue={tracks}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() =>
                      reorderTrackInPlaylist(playlist.id, idx, idx - 1)
                    }
                    aria-label="Di chuyển lên"
                    title="Di chuyển lên"
                    className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white disabled:opacity-25"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === tracks.length - 1}
                    onClick={() =>
                      reorderTrackInPlaylist(playlist.id, idx, idx + 1)
                    }
                    aria-label="Di chuyển xuống"
                    title="Di chuyển xuống"
                    className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white disabled:opacity-25"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      removeTrackFromPlaylist(playlist.id, track.id)
                    }
                    aria-label="Xóa khỏi playlist"
                    title="Xóa khỏi playlist"
                    className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
