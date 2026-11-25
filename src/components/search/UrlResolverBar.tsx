"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Link2, Loader2 } from "lucide-react";
import type { ResolveResponse } from "@/lib/audio/types";
import { BUTTON_MOTION } from "@/lib/ui/source-theme";
import { usePlayerStore } from "@/store/usePlayerStore";
import { getByokHeaders } from "@/store/useSettingsStore";

export function UrlResolverBar() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);

  const router = useRouter();
  const playTrack = usePlayerStore((s) => s.playTrack);

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getByokHeaders(),
        },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = (await res.json()) as ResolveResponse & {
        error?: string;
      };

      if (res.ok && data.type === "artist" && data.artistName) {
        setUrl("");
        router.push(
          `/artist/${encodeURIComponent(data.artistName)}?source=spotify${
            data.artistId ? `&artistId=${encodeURIComponent(data.artistId)}` : ""
          }`
        );
        return;
      }

      if (!res.ok || !data.tracks?.length) {
        setStatus({
          type: "error",
          message: data.error || "Không thể nhận diện liên kết nhạc này.",
        });
        return;
      }

      playTrack(data.tracks[0], data.tracks);
      setUrl("");
      setStatus({
        type: "success",
        message:
          data.tracks.length > 1
            ? `Đã nạp ${data.tracks.length} bài từ "${data.title || "Playlist"}" (lazy matching từng bài).`
            : `Đang phát: ${data.tracks[0].title}`,
      });
    } catch {
      setStatus({
        type: "error",
        message: "Lỗi kết nối máy chủ khi phân tích liên kết.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-3.5 shadow-xl shadow-black/30 backdrop-blur-xl">
      <form
        onSubmit={handleResolve}
        className="flex flex-col gap-2.5 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            id="hnbee-import-url-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Import Playlist / Track URL: Spotify (Track/Playlist/Album), YouTube (Video/Playlist), SoundCloud..."
            className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-white/25 focus:outline-none"
          />
        </div>
        <motion.button
          type="submit"
          {...BUTTON_MOTION}
          disabled={loading || !url.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-md transition-opacity hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Đang xử lý</span>
            </>
          ) : (
            <>
              <span>Phát ngay</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </motion.button>
      </form>

      {status && (
        <p
          className={`mt-2.5 text-xs ${
            status.type === "error" ? "text-rose-400" : "text-emerald-400"
          }`}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
