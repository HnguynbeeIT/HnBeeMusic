"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[HnBeeMusic GlobalError]", error);
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
    <html lang="vi" className="dark">
      <body className="flex min-h-screen items-center justify-center bg-[#09090b] p-4 font-sans text-zinc-100 antialiased">
        <div className="w-full max-w-md space-y-5 rounded-3xl border border-white/10 bg-zinc-900/85 p-6 text-center shadow-2xl">
          <h1 className="text-lg font-bold text-white">
            HnBee Music — Khôi phục sự cố
          </h1>
          <p className="text-xs leading-relaxed text-zinc-400">
            Trình duyệt gặp lỗi ngoại lệ khi tải ứng dụng. Hãy bấm tải lại trang
            hoặc đặt lại bộ nhớ đệm cục bộ.
          </p>

          {error?.message && (
            <div className="rounded-xl border border-rose-500/20 bg-black/50 p-3 text-left font-mono text-[11px] text-rose-300 break-words">
              {error.message}
            </div>
          )}

          <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200"
            >
              Tải lại trang
            </button>
            <button
              type="button"
              onClick={handleResetLocalData}
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
            >
              Đặt lại dữ liệu cục bộ
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
