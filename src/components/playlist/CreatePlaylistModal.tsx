"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  FolderPlus,
  Image as ImageIcon,
  Link2,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import type { UnifiedTrack } from "@/lib/audio/types";
import { usePlaylistStore } from "@/store/usePlaylistStore";
import { getByokHeaders } from "@/store/useSettingsStore";
import { BUTTON_MOTION, SPRING_PHYSICS } from "@/lib/ui/source-theme";
import { PlaylistCover } from "./PlaylistCover";

export function CreatePlaylistModal() {
  const router = useRouter();
  const isOpen = usePlaylistStore((s) => s.isCreateModalOpen);
  const seedTrack = usePlaylistStore((s) => s.createModalSeedTrack);
  const closeCreateModal = usePlaylistStore((s) => s.closeCreateModal);
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importedTracks, setImportedTracks] = useState<UnifiedTrack[]>([]);
  const [importFeedback, setImportFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setDescription("");
      setCoverUrl("");
      setImportUrl("");
      setImporting(false);
      setImportedTracks(seedTrack ? [seedTrack] : []);
      setImportFeedback(null);
    }
  }, [isOpen, seedTrack]);

  const handleImportLink = async () => {
    const raw = importUrl.trim();
    if (!raw || importing) return;

    setImporting(true);
    setImportFeedback(null);
    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getByokHeaders(),
        },
        body: JSON.stringify({ url: raw }),
      });
      const data = (await res.json()) as {
        title?: string;
        tracks?: UnifiedTrack[];
        error?: string;
      };

      if (!res.ok || !Array.isArray(data.tracks) || data.tracks.length === 0) {
        setImportFeedback({
          type: "error",
          message:
            data.error ||
            "Không thể quét bài hát từ link này. Hỗ trợ Spotify, YouTube & SoundCloud.",
        });
        return;
      }

      const merged: UnifiedTrack[] = [];
      const seen = new Set<string>();
      for (const t of [...importedTracks, ...data.tracks]) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          merged.push(t);
        }
      }
      setImportedTracks(merged);
      if (!name.trim() && data.title) {
        setName(data.title);
      }
      setImportFeedback({
        type: "success",
        message: `Đã quét thành công ${data.tracks.length} bài hát${
          data.title ? ` từ "${data.title}"` : ""
        }!`,
      });
    } catch {
      setImportFeedback({
        type: "error",
        message: "Lỗi kết nối khi quét link playlist.",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const created = createPlaylist({
      name: name.trim(),
      description: description.trim() || undefined,
      coverUrl: coverUrl.trim() || undefined,
      tracks: importedTracks,
    });
    closeCreateModal();
    router.push(`/library/playlist/${encodeURIComponent(created.id)}`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeCreateModal}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={SPRING_PHYSICS}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/90 shadow-2xl shadow-black/70 backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                  <FolderPlus className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    Tạo Playlist Mới
                  </h2>
                  <p className="text-[11px] text-zinc-400">
                    Tự động đồng bộ Server &amp; trộn nhạc đa nguồn
                  </p>
                </div>
              </div>

              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={closeCreateModal}
                aria-label="Đóng"
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </motion.button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              {/* Cover Preview + Basic Info */}
              <div className="flex items-start gap-4">
                <PlaylistCover
                  name={name || "Playlist mới"}
                  coverUrl={coverUrl}
                  tracks={importedTracks}
                  className="h-24 w-24 shrink-0 rounded-2xl shadow-xl"
                />
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-300">
                      Tên Playlist <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="vd: Chill Đêm Khuya, Rap Việt Tuyển Chọn..."
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-400/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-300">
                      Mô tả ngắn{" "}
                      <span className="font-normal text-zinc-500">
                        (Tùy chọn)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Ghi chú tâm trạng, thể loại..."
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Optional Custom Cover URL */}
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <ImageIcon className="h-3.5 w-3.5 text-zinc-400" />
                  URL Ảnh bìa{" "}
                  <span className="font-normal text-zinc-500">
                    (Bỏ trống sẽ tự ghép lưới 4 ảnh bài hát)
                  </span>
                </label>
                <input
                  type="url"
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
                />
              </div>

              {/* Quick Import from Spotify / YouTube / SoundCloud Link */}
              <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                  <Link2 className="h-3.5 w-3.5 text-emerald-400" />
                  Import nhanh từ Link{" "}
                  <span className="font-normal text-zinc-500">
                    (Spotify, YouTube, SoundCloud)
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="Dán link Playlist / Album / Track..."
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-emerald-400/50 focus:outline-none"
                  />
                  <motion.button
                    type="button"
                    {...BUTTON_MOTION}
                    disabled={!importUrl.trim() || importing}
                    onClick={handleImportLink}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40"
                  >
                    {importing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Quét bài hát
                  </motion.button>
                </div>

                {importFeedback && (
                  <p
                    className={`flex items-center gap-1.5 text-[11px] ${
                      importFeedback.type === "error"
                        ? "text-rose-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {importFeedback.type === "success" && (
                      <Check className="h-3 w-3 shrink-0" />
                    )}
                    {importFeedback.message}
                  </p>
                )}

                {importedTracks.length > 0 && (
                  <p className="text-[11px] text-zinc-400">
                    Sẵn sàng lưu{" "}
                    <strong className="text-white">
                      {importedTracks.length} bài hát
                    </strong>{" "}
                    vào playlist này.
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-white/10"
                >
                  Hủy
                </button>
                <motion.button
                  type="submit"
                  {...BUTTON_MOTION}
                  disabled={!name.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white px-5 py-2 text-xs font-semibold text-zinc-950 shadow-lg hover:bg-zinc-100 disabled:opacity-40"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  Tạo &amp; Lưu Playlist
                </motion.button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
