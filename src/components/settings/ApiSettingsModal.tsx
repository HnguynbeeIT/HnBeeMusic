"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Cloud,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  SkipForward,
  Trash2,
  X,
} from "lucide-react";
import {
  useSettingsStore,
  type ApiKeysConfig,
} from "@/store/useSettingsStore";
import { useAuthStore } from "@/store/useAuthStore";
import { BUTTON_MOTION, SPRING_PHYSICS } from "@/lib/ui/source-theme";
import { BrandLogo } from "@/components/BrandLogo";
import { BrandCredit } from "@/components/BrandCredit";

export function ApiSettingsModal() {
  const isOpen = useSettingsStore((s) => s.isSettingsOpen);
  const youtubeApiKey = useSettingsStore((s) => s.youtubeApiKey);
  const spotifyClientId = useSettingsStore((s) => s.spotifyClientId);
  const spotifyClientSecret = useSettingsStore((s) => s.spotifyClientSecret);
  const soundcloudClientId = useSettingsStore((s) => s.soundcloudClientId);
  const autoSkipSponsor = useSettingsStore((s) => s.autoSkipSponsor);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);
  const setAutoSkipSponsor = useSettingsStore((s) => s.setAutoSkipSponsor);
  const saveKeys = useSettingsStore((s) => s.saveKeys);
  const clearKeys = useSettingsStore((s) => s.clearKeys);

  const user = useAuthStore((s) => s.user);
  const authMode = useAuthStore((s) => s.authMode);
  const syncStatus = useAuthStore((s) => s.syncStatus);
  const lastSyncedAt = useAuthStore((s) => s.lastSyncedAt);
  const syncNow = useAuthStore((s) => s.syncNow);
  const setAuthModalOpen = useAuthStore((s) => s.setAuthModalOpen);

  const formattedLastSync = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  const [form, setForm] = useState<ApiKeysConfig>({
    youtubeApiKey: "",
    spotifyClientId: "",
    spotifyClientSecret: "",
    soundcloudClientId: "",
  });
  const [showSecrets, setShowSecrets] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [serverKeyActive, setServerKeyActive] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm({
        youtubeApiKey,
        spotifyClientId,
        spotifyClientSecret,
        soundcloudClientId,
      });
      setSavedToast(false);
      fetch("/api/settings/status", { cache: "no-store" })
        .then((res) => res.json())
        .then((data: { serverKeyActive?: boolean }) => {
          setServerKeyActive(Boolean(data.serverKeyActive));
        })
        .catch(() => {});
    }
  }, [
    isOpen,
    youtubeApiKey,
    spotifyClientId,
    spotifyClientSecret,
    soundcloudClientId,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveKeys(form);
    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      setSettingsOpen(false);
    }, 700);
  };

  const handleClear = () => {
    clearKeys();
    setForm({
      youtubeApiKey: "",
      spotifyClientId: "",
      spotifyClientSecret: "",
      soundcloudClientId: "",
    });
  };

  const configuredCount = [
    youtubeApiKey,
    spotifyClientId && spotifyClientSecret ? "sp" : "",
    soundcloudClientId,
  ].filter(Boolean).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSettingsOpen(false)}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={SPRING_PHYSICS}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/85 shadow-2xl shadow-black/70 backdrop-blur-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <BrandLogo variant="compact" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold text-white">
                      <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
                      API Settings (BYOK)
                    </h2>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        configuredCount > 0
                          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-400"
                          : serverKeyActive
                          ? "border-sky-400/30 bg-sky-500/10 text-sky-400"
                          : "border-amber-400/30 bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          configuredCount > 0
                            ? "bg-emerald-400"
                            : serverKeyActive
                            ? "bg-sky-400"
                            : "bg-amber-400"
                        }`}
                      />
                      {configuredCount > 0
                        ? "Custom BYOK Active"
                        : serverKeyActive
                        ? "Server Key Active"
                        : "Zero-Key Mode"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {configuredCount > 0
                      ? `Đang ưu tiên ${configuredCount} API Key cá nhân của bạn`
                      : serverKeyActive
                      ? "Đang dùng API Key mặc định của máy chủ (bạn có thể nhập key riêng bên dưới)"
                      : "Tự nhập API Keys miễn phí của bạn để không giới hạn quota"}
                  </p>
                </div>
              </div>

              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={() => setSettingsOpen(false)}
                aria-label="Đóng cài đặt"
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </motion.button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              {/* Privacy notice */}
              <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs leading-relaxed text-zinc-300">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <p>
                  Key của bạn chỉ được lưu trong{" "}
                  <code className="text-emerald-300">localStorage</code> trên
                  trình duyệt này và gửi qua header bảo mật tới API route của
                  ứng dụng. Máy chủ không lưu trữ hay ghi log key cá nhân.
                </p>
              </div>

              {/* YouTube API Key */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-200">
                    YouTube Data API v3 Key
                  </label>
                  <a
                    href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:underline"
                  >
                    Lấy miễn phí <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <input
                  type={showSecrets ? "text" : "password"}
                  value={form.youtubeApiKey}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, youtubeApiKey: e.target.value }))
                  }
                  placeholder="AIzaSy..."
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-zinc-600 focus:border-rose-500/50 focus:outline-none"
                />
              </div>

              {/* Spotify Client ID & Secret */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-200">
                    Spotify Web API (Client ID &amp; Secret)
                  </label>
                  <a
                    href="https://developer.spotify.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
                  >
                    Spotify Dashboard <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={form.spotifyClientId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, spotifyClientId: e.target.value }))
                    }
                    placeholder="Spotify Client ID"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none"
                  />
                  <input
                    type={showSecrets ? "text" : "password"}
                    value={form.spotifyClientSecret}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        spotifyClientSecret: e.target.value,
                      }))
                    }
                    placeholder="Spotify Client Secret"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>
              </div>

              {/* SoundCloud Client ID (Optional) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-200">
                    SoundCloud Client ID{" "}
                    <span className="font-normal text-zinc-500">(Tùy chọn)</span>
                  </label>
                  <span className="text-[11px] text-orange-400/90">
                    Để trống dùng Widget API
                  </span>
                </div>
                <input
                  type={showSecrets ? "text" : "password"}
                  value={form.soundcloudClientId}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      soundcloudClientId: e.target.value,
                    }))
                  }
                  placeholder="Tự động trích xuất nếu để trống"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-zinc-600 focus:border-orange-400/50 focus:outline-none"
                />
              </div>

              {/* Auto-Skip Intro & Sponsor (SponsorBlock) */}
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
                    <SkipForward className="h-3.5 w-3.5 text-emerald-400" />
                    Auto-Skip Intro &amp; Sponsor
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">
                    Tự động tua qua quảng cáo, đoạn thoại Intro/Outro phi âm nhạc trong MV YouTube (SponsorBlock).
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoSkipSponsor}
                  aria-label="Bật hoặc tắt Auto-Skip Intro & Sponsor"
                  onClick={() => setAutoSkipSponsor(!autoSkipSponsor)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                    autoSkipSponsor
                      ? "border-emerald-400/50 bg-emerald-500/80"
                      : "border-white/15 bg-zinc-800"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                      autoSkipSponsor ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {/* Server Cloud Sync Status Card */}
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] px-3.5 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
                    <Cloud className="h-3.5 w-3.5 text-emerald-400" />
                    Server Cloud Sync
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">
                    {user && authMode === "cloud"
                      ? formattedLastSync
                        ? `Đã đồng bộ (@${user.username}) • Last synced: ${formattedLastSync}`
                        : `Đang đồng bộ tự động cho @${user.username}`
                      : "Đăng nhập để đồng bộ Playlists, Liked Songs & Nghệ sĩ lên Server."}
                  </p>
                </div>
                {user && authMode === "cloud" ? (
                  <button
                    type="button"
                    disabled={syncStatus === "syncing"}
                    onClick={() => void syncNow()}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${
                        syncStatus === "syncing" ? "animate-spin" : ""
                      }`}
                    />
                    Đồng bộ ngay
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen(false);
                      setAuthModalOpen(true);
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
                  >
                    Đăng nhập
                  </button>
                )}
              </div>

              {/* Footer Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSecrets((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/10"
                  >
                    {showSecrets ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5" /> Ẩn key
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" /> Hiện key
                      </>
                    )}
                  </button>

                  {configuredCount > 0 && (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Xóa hết
                    </button>
                  )}
                </div>

                <motion.button
                  type="submit"
                  {...BUTTON_MOTION}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-zinc-950 shadow-lg hover:bg-zinc-100"
                >
                  {savedToast ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      Đã lưu!
                    </>
                  ) : (
                    "Lưu API Keys"
                  )}
                </motion.button>
              </div>
            </form>

            <div className="border-t border-white/10 bg-black/20 px-6 py-3 text-center">
              <BrandCredit />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
