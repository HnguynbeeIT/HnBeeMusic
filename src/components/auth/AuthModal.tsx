"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Cloud,
  Download,
  Loader2,
  LogOut,
  RefreshCw,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { usePlayerStore } from "@/store/usePlayerStore";
import { BUTTON_MOTION, SPRING_PHYSICS } from "@/lib/ui/source-theme";
import { BrandLogo } from "@/components/BrandLogo";
import { BrandCredit } from "@/components/BrandCredit";

export function getInitials(name: string): string {
  const parts = name.trim().split(/[\s_-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "HB";
}

export function AuthModal() {
  const isOpen = useAuthStore((s) => s.isAuthModalOpen);
  const user = useAuthStore((s) => s.user);
  const authMode = useAuthStore((s) => s.authMode);
  const syncStatus = useAuthStore((s) => s.syncStatus);
  const lastSyncedAt = useAuthStore((s) => s.lastSyncedAt);
  const setAuthModalOpen = useAuthStore((s) => s.setAuthModalOpen);
  const register = useAuthStore((s) => s.register);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const syncNow = useAuthStore((s) => s.syncNow);
  const exportProfileJson = useAuthStore((s) => s.exportProfileJson);
  const importProfileJson = useAuthStore((s) => s.importProfileJson);
  const likedCount = usePlayerStore((s) => s.likedTracks.length);

  const formattedLastSync = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  const handleManualSync = async () => {
    const ok = await syncNow();
    setFeedback({
      type: ok ? "success" : "error",
      message: ok
        ? "Đã đồng bộ toàn bộ Playlists, Liked Songs & Nghệ sĩ lên Server!"
        : "Không thể đồng bộ lên Server lúc này.",
    });
  };

  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "error" | "success";
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetForm = () => {
    setUsername("");
    setDisplayName("");
    setPassword("");
    setFeedback(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFeedback(null);

    const res =
      tab === "register"
        ? await register({ username, displayName, password })
        : await login({ username, password });

    setSubmitting(false);

    if (!res.ok) {
      setFeedback({
        type: "error",
        message: res.error || "Đã xảy ra lỗi xác thực.",
      });
      return;
    }

    resetForm();
    setFeedback({
      type: "success",
      message:
        tab === "register"
          ? "Tạo tài khoản và đăng nhập thành công!"
          : "Đăng nhập thành công!",
    });
  };

  const handleExport = () => {
    const json = exportProfileJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hnbeemusic-profile-${user?.username || "local"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setFeedback({
      type: "success",
      message: "Đã xuất file backup hồ sơ (.json) thành công.",
    });
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      const res = importProfileJson(content);
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: res.error || "Không thể nhập file hồ sơ.",
        });
      } else {
        setFeedback({
          type: "success",
          message:
            "Đã khôi phục Liked Songs, tùy chọn phát nhạc & API Keys từ file JSON!",
        });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleLogout = async () => {
    await logout();
    resetForm();
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
            onClick={() => setAuthModalOpen(false)}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={SPRING_PHYSICS}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/80 shadow-2xl shadow-black/70 backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <BrandLogo variant="compact" />
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-white">
                    {user ? "Tài khoản HnBee Music" : "Đăng nhập nhanh"}
                  </h2>
                  {/* Server Cloud Sync Badge */}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                    <Cloud className="h-3 w-3" />
                    {syncStatus === "syncing"
                      ? "Đang đồng bộ Server..."
                      : authMode === "cloud"
                      ? "Cloud Synced • Server DB"
                      : "Server Cloud Sync Ready"}
                  </span>
                </div>
              </div>

              <motion.button
                type="button"
                {...BUTTON_MOTION}
                onClick={() => setAuthModalOpen(false)}
                aria-label="Đóng"
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </motion.button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              className="hidden"
            />

            {/* Body */}
            <div className="p-6">
              {user ? (
                /* LOGGED-IN PROFILE VIEW */
                <div className="space-y-5">
                  <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 text-lg font-bold text-zinc-950 shadow-lg">
                      {getInitials(user.displayName || user.username)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-white">
                        {user.displayName}
                      </p>
                      <p className="truncate font-mono text-xs text-zinc-400">
                        @{user.username}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {likedCount} bài hát đã thích
                      </p>
                    </div>
                  </div>

                  {/* Cloud Sync Status & Sync Now */}
                  {authMode === "cloud" && (
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              syncStatus === "syncing"
                                ? "animate-pulse bg-sky-400"
                                : "bg-emerald-400 shadow-[0_0_8px_#34d399]"
                            }`}
                          />
                          {syncStatus === "syncing"
                            ? "Đang đồng bộ lên Server..."
                            : "Cloud Synced • Đã đồng bộ Server"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-400">
                          {formattedLastSync
                            ? `Last synced: ${formattedLastSync}`
                            : "Tự động đồng bộ theo thời gian thực"}
                        </p>
                      </div>
                      <motion.button
                        type="button"
                        {...BUTTON_MOTION}
                        disabled={syncStatus === "syncing"}
                        onClick={handleManualSync}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${
                            syncStatus === "syncing" ? "animate-spin" : ""
                          }`}
                        />
                        Sync Now
                      </motion.button>
                    </div>
                  )}

                  {/* Export / Import Profile (.json) */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-zinc-300">
                      Sao lưu &amp; Chuyển trình duyệt (.json)
                    </p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <motion.button
                        type="button"
                        {...BUTTON_MOTION}
                        onClick={handleExport}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-medium text-zinc-200 hover:bg-white/10"
                      >
                        <Download className="h-3.5 w-3.5 text-emerald-400" />
                        Export JSON
                      </motion.button>

                      <motion.button
                        type="button"
                        {...BUTTON_MOTION}
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-medium text-zinc-200 hover:bg-white/10"
                      >
                        <Upload className="h-3.5 w-3.5 text-amber-400" />
                        Import JSON
                      </motion.button>
                    </div>
                  </div>

                  {feedback && (
                    <p
                      className={`text-xs ${
                        feedback.type === "error"
                          ? "text-rose-400"
                          : "text-emerald-400"
                      }`}
                    >
                      {feedback.message}
                    </p>
                  )}

                  <div className="border-t border-white/10 pt-4">
                    <motion.button
                      type="button"
                      {...BUTTON_MOTION}
                      onClick={handleLogout}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 py-2.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20"
                    >
                      <LogOut className="h-4 w-4" />
                      Đăng xuất
                    </motion.button>
                  </div>
                </div>
              ) : (
                /* LOGIN / ZERO-VERIFICATION REGISTER TABS */
                <div className="space-y-5">
                  {/* Smooth Framer Motion Tab Switcher (layoutId) */}
                  <div className="grid grid-cols-2 rounded-2xl border border-white/10 bg-black/40 p-1">
                    {(
                      [
                        { id: "login", label: "Đăng nhập" },
                        { id: "register", label: "Tạo tài khoản nhanh" },
                      ] as const
                    ).map((item) => {
                      const active = tab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setTab(item.id);
                            setFeedback(null);
                          }}
                          className={`relative rounded-xl py-2 text-xs font-semibold transition-colors ${
                            active
                              ? "text-white"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="authModalTab"
                              transition={SPRING_PHYSICS}
                              className="absolute inset-0 -z-10 rounded-xl border border-white/15 bg-white/15"
                            />
                          )}
                          {item.label}
                        </button>
                      );
                    })}
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-3.5">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-zinc-300">
                        Tên đăng nhập (username)
                      </label>
                      <input
                        type="text"
                        required
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="vd: hnb_audiophile (a-z, 0-9, _)"
                        className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
                      />
                    </div>

                    {tab === "register" && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-zinc-300">
                          Tên hiển thị{" "}
                          <span className="font-normal text-zinc-500">
                            (Tùy chọn)
                          </span>
                        </label>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="vd: HnBee Listener"
                          className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-zinc-300">
                        Mật khẩu
                      </label>
                      <input
                        type="password"
                        required
                        autoComplete={
                          tab === "register"
                            ? "new-password"
                            : "current-password"
                        }
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Tối thiểu 6 ký tự"
                        className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
                      />
                    </div>

                    {tab === "register" && (
                      <p className="text-[11px] leading-relaxed text-zinc-500">
                        Không cần email, không cần OTP hay số điện thoại — tạo
                        tài khoản và đăng nhập ngay lập tức.
                      </p>
                    )}

                    {feedback && (
                      <p
                        className={`flex items-center gap-1.5 text-xs ${
                          feedback.type === "error"
                            ? "text-rose-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {feedback.type === "success" && (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        {feedback.message}
                      </p>
                    )}

                    <motion.button
                      type="submit"
                      {...BUTTON_MOTION}
                      disabled={submitting}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-zinc-950 shadow-lg hover:bg-zinc-100 disabled:opacity-50"
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : tab === "register" ? (
                        <>
                          <UserPlus className="h-4 w-4" />
                          Tạo tài khoản &amp; Vào ngay
                        </>
                      ) : (
                        "Đăng nhập"
                      )}
                    </motion.button>
                  </form>

                  {/* Import local backup shortcut */}
                  <div className="flex items-center justify-between border-t border-white/10 pt-3.5 text-[11px] text-zinc-500">
                    <span>Đã có file backup Local?</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 font-medium text-zinc-300 hover:text-white"
                    >
                      <Upload className="h-3 w-3" />
                      Import Profile (.json)
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-white/10 bg-black/20 px-6 py-3 text-center">
              <BrandCredit />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
