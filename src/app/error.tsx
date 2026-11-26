"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[HnBeeMusic ErrorBoundary]", error);
  }, [error]);

  const handleResetLocalData = () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith("hnbeemusic-")) {
          keysToRemove.push(k);
        }
      }
      for (const k of keysToRemove) {
        window.localStorage.removeItem(k);
      }
    } catch {}
    window.location.href = "/";
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5 rounded-3xl border border-white/10 bg-zinc-900/80 p-6 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-400">
          <AlertTriangle className="h-6 w-6" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-white">
            Đã xảy ra sự cố hiển thị
          </h2>
          <p className="text-xs leading-relaxed text-zinc-400">
            Ứng dụng gặp lỗi không mong muốn trên trình duyệt này. Bạn có thể
            tải lại trang hoặc đặt lại dữ liệu cục bộ để khắc phục ngay.
          </p>
        </div>

        {error?.message && (
          <div className="rounded-xl border border-rose-500/20 bg-black/40 p-3 text-left font-mono text-[11px] text-rose-300 break-words">
            {error.message}
          </div>
        )}

        <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tải lại trang
          </button>

          <button
            type="button"
            onClick={handleResetLocalData}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Đặt lại dữ liệu cục bộ
          </button>
        </div>
      </div>
    </div>
  );
}
