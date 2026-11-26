"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Share, X } from "lucide-react";
import { SPRING_PHYSICS } from "@/lib/ui/source-theme";

const DISMISS_KEY = "hnbeemusic-ios-install-dismissed";

/**
 * Subtle iOS Safari PWA install banner shown ONLY on iPhone/iPad Safari
 * when not yet installed to the Home Screen (standalone mode).
 */
export function IOSInstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
      const ua = navigator.userAgent || "";
      const isIos = /iPhone|iPad|iPod/i.test(ua);
      const isSafari =
        /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
      const isStandalone =
        window.matchMedia?.("(display-mode: standalone)")?.matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;

      if (isIos && isSafari && !isStandalone) {
        setVisible(true);
      }
    } catch {}
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={SPRING_PHYSICS}
          className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-3 rounded-2xl border border-emerald-400/25 bg-zinc-900/95 px-3.5 py-2.5 shadow-2xl shadow-black/70 backdrop-blur-2xl md:hidden"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Share className="h-4 w-4" />
          </div>
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-zinc-200">
            Cài <strong className="text-white">HnBee Music</strong> ra màn hình
            chính để nghe nền mượt hơn: bấm{" "}
            <strong className="text-emerald-300">Chia sẻ</strong> →{" "}
            <strong className="text-emerald-300">Thêm vào MH chính</strong>.
          </p>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Đóng hướng dẫn cài đặt iOS"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
