"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Compass,
  Flame,
  Home,
  Info,
  Library,
  Monitor,
  Play,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import {
  CURATED_PLAYLISTS,
  FALLBACK_CATALOG,
} from "@/lib/adapters/fallback-catalog";
import { BUTTON_MOTION, SPRING_PHYSICS } from "@/lib/ui/source-theme";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useAuthStore } from "@/store/useAuthStore";
import { usePlaylistStore } from "@/store/usePlaylistStore";
import { useArtistStore } from "@/store/useArtistStore";
import { buildArtistHref } from "@/components/artist/ArtistLink";
import { TrackThumbnail } from "@/components/track/TrackThumbnail";
import { BrandLogo } from "@/components/BrandLogo";
import { BrandCredit } from "@/components/BrandCredit";
import { RegionSelector } from "@/components/layout/RegionSelector";
import { isElectronClient } from "@/components/layout/ElectronTitleBar";
import { getInitials } from "@/components/auth/AuthModal";

const NAV_ITEMS = [
  { href: "/", label: "Khám phá", icon: Compass },
  { href: "/trending", label: "Trending", icon: Flame },
  { href: "/library", label: "Thư viện", icon: Library },
];

const MOBILE_NAV_ITEMS = [
  { href: "/", label: "Trang chủ", icon: Home },
  { href: "/trending", label: "Khám phá", icon: Compass },
  { href: "/search", label: "Tìm kiếm", icon: Search },
  { href: "/library", label: "Thư viện", icon: Library },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [quickQuery, setQuickQuery] = useState("");
  const [isDesktopApp, setIsDesktopApp] = useState(false);

  const likedCount = usePlayerStore((s) => s.likedTracks.length);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);
  const setAboutOpen = useSettingsStore((s) => s.setAboutOpen);
  const hasCustomKeys = useSettingsStore((s) =>
    Boolean(
      s.youtubeApiKey ||
        (s.spotifyClientId && s.spotifyClientSecret) ||
        s.soundcloudClientId
    )
  );

  const user = useAuthStore((s) => s.user);
  const authMode = useAuthStore((s) => s.authMode);
  const syncStatus = useAuthStore((s) => s.syncStatus);
  const initAuth = useAuthStore((s) => s.initAuth);
  const setAuthModalOpen = useAuthStore((s) => s.setAuthModalOpen);
  const userPlaylists = usePlaylistStore((s) => s.playlists);
  const openCreateModal = usePlaylistStore((s) => s.openCreateModal);
  const followedArtists = useArtistStore((s) => s.followedArtists);

  useEffect(() => {
    void initAuth();
    setIsDesktopApp(isElectronClient());
  }, [initAuth]);

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = quickQuery.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };

  const handlePlayPlaylist = (trackIds: string[]) => {
    const tracks = trackIds
      .map((id) => FALLBACK_CATALOG.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    }
  };

  return (
    <>
      {/* MOBILE TOP GLASS HEADER (Dynamic Island / Notch safe-area aware) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#09090b]/85 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur-xl md:hidden">
        <Link href="/" aria-label="HnBee Music Home">
          <BrandLogo variant="compact" />
        </Link>
        <div className="flex items-center gap-1.5">
          <RegionSelector compact />
          <motion.button
            type="button"
            {...BUTTON_MOTION}
            onClick={() => setAboutOpen(true)}
            aria-label="Giới thiệu HnBee Music"
            title="Giới thiệu HnBee Music"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-zinc-900/70 text-zinc-300"
          >
            <Info className="h-4 w-4" />
          </motion.button>
          <motion.button
            type="button"
            {...BUTTON_MOTION}
            onClick={() => setSettingsOpen(true)}
            aria-label="API Settings (BYOK)"
            className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-zinc-900/70 text-zinc-300"
          >
            <Settings className="h-4 w-4" />
            {hasCustomKeys && (
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-400" />
            )}
          </motion.button>
          <motion.button
            type="button"
            {...BUTTON_MOTION}
            onClick={() => setAuthModalOpen(true)}
            aria-label="Tài khoản & Đồng bộ Server"
            className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-zinc-900/70 text-zinc-300"
          >
            {user ? (
              user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  referrerPolicy="no-referrer"
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-[10px] font-bold text-zinc-950">
                  {getInitials(user.displayName || user.username)}
                </span>
              )
            ) : (
              <UserRound className="h-4 w-4" />
            )}
            {user && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
            )}
          </motion.button>
        </div>
      </header>

      {/* DESKTOP FLOATING GLASS SIDEBAR (w-64 m-2 rounded-2xl) */}
      <aside className="hnbee-desktop-sidebar fixed bottom-28 left-0 top-0 z-30 m-2 hidden w-64 flex-col rounded-2xl border border-white/10 bg-zinc-900/60 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl md:flex">
        {/* Brand Logo + API Settings Gear */}
        <div className="mb-4 flex items-center justify-between px-1">
          <Link href="/" aria-label="HnBee Music Home" className="inline-flex">
            <BrandLogo variant="full" />
          </Link>

          <motion.button
            type="button"
            {...BUTTON_MOTION}
            onClick={() => setSettingsOpen(true)}
            aria-label="API Settings (BYOK)"
            title="API Settings (BYOK)"
            className="relative self-start rounded-xl border border-white/10 bg-black/30 p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Settings className="h-4 w-4" />
            {hasCustomKeys && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
            )}
          </motion.button>
        </div>

        {/* Quick Search Bar */}
        <form onSubmit={handleQuickSearch} className="relative mb-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={quickQuery}
            onChange={(e) => setQuickQuery(e.target.value)}
            placeholder="Tìm nhanh bài hát..."
            className="w-full rounded-xl border border-white/10 bg-black/40 py-2 pl-9 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-white/25 focus:outline-none"
          />
        </form>

        {/* Navigation with layoutId="sidebarActive" */}
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "text-white" : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="sidebarActive"
                    transition={SPRING_PHYSICS}
                    className="absolute inset-0 -z-10 rounded-xl border border-white/10 bg-white/10 shadow-sm"
                  />
                )}
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </span>
                {item.href === "/library" && likedCount > 0 && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] tabular-nums text-zinc-300">
                    {likedCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User & Curated Playlists with thumbnails */}
        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="mb-2.5 flex items-center justify-between px-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Playlists
            </p>
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300"
            >
              + Tạo mới
            </button>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto pr-0.5">
            {followedArtists.length > 0 && (
              <div className="mb-3 space-y-1">
                <p className="px-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Nghệ sĩ đang theo dõi
                </p>
                {followedArtists.slice(0, 5).map((artist) => (
                  <Link
                    key={artist.id}
                    href={buildArtistHref(artist.name, artist.primarySource)}
                    className="flex items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-white/5"
                  >
                    <TrackThumbnail
                      src={artist.avatar}
                      alt={artist.name}
                      className="h-8 w-8 rounded-full"
                    />
                    <span className="truncate text-xs font-medium text-zinc-200 hover:text-white">
                      {artist.name}
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {(Array.isArray(userPlaylists) ? userPlaylists : []).map((pl) => {
              const plTracks = Array.isArray(pl?.tracks) ? pl.tracks : [];
              return (
              <div
                key={pl.id}
                className="group flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors hover:bg-white/5"
              >
                <button
                  type="button"
                  onClick={() =>
                    plTracks.length > 0
                      ? playTrack(plTracks[0], plTracks)
                      : router.push(`/library/playlist/${encodeURIComponent(pl.id)}`)
                  }
                  aria-label={`Phát ${pl.name}`}
                  className="relative shrink-0"
                >
                  <TrackThumbnail
                    src={pl.coverUrl || plTracks[0]?.thumbnail}
                    alt={pl.name}
                    className="h-10 w-10 rounded-lg"
                  />
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <Play className="h-3.5 w-3.5 translate-x-[1px] fill-white text-white" />
                  </div>
                </button>
                <Link
                  href={`/library/playlist/${encodeURIComponent(pl.id)}`}
                  className="min-w-0 flex-1"
                >
                  <p className="truncate text-xs font-medium text-emerald-300 group-hover:text-emerald-200">
                    {pl.name}
                  </p>
                  <p className="truncate text-[11px] text-zinc-500">
                    {plTracks.length} bài · Cá nhân
                  </p>
                </Link>
              </div>
              );
            })}

            {CURATED_PLAYLISTS.map((pl) => (
              <button
                key={pl.id}
                type="button"
                onClick={() => handlePlayPlaylist(pl.trackIds)}
                className="group flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors hover:bg-white/5"
              >
                <div className="relative shrink-0">
                  <TrackThumbnail
                    src={pl.thumbnail}
                    alt={pl.name}
                    className="h-10 w-10 rounded-lg"
                  />
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <Play className="h-3.5 w-3.5 translate-x-[1px] fill-white text-white" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-zinc-200 group-hover:text-white">
                    {pl.name}
                  </p>
                  <p className="truncate text-[11px] text-zinc-500">
                    {pl.subtitle}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom Server Cloud Sync Profile Card */}
        <div className="mt-3 border-t border-white/10 pt-3">
          <motion.button
            type="button"
            {...BUTTON_MOTION}
            onClick={() => setAuthModalOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-left transition-colors hover:bg-white/10"
          >
            {user ? (
              <>
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName}
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 shrink-0 rounded-lg border border-white/15 object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 text-xs font-bold text-zinc-950">
                    {getInitials(user.displayName || user.username)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">
                    {user.displayName}
                  </p>
                  <p
                    className={`truncate text-[10px] font-medium ${
                      syncStatus === "syncing"
                        ? "text-sky-400"
                        : authMode === "cloud"
                        ? "text-emerald-400"
                        : "text-zinc-400"
                    }`}
                  >
                    {syncStatus === "syncing"
                      ? "Đang đồng bộ..."
                      : authMode === "cloud"
                      ? "Cloud Synced • Đã đồng bộ Server"
                      : `@${user.username}`}
                  </p>
                </div>
                <span
                  title={
                    syncStatus === "syncing"
                      ? "Đang đồng bộ lên Server..."
                      : "Cloud Synced • Đã đồng bộ Server"
                  }
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    syncStatus === "syncing"
                      ? "animate-pulse bg-sky-400 shadow-[0_0_8px_#38bdf8]"
                      : "bg-emerald-400 shadow-[0_0_8px_#34d399]"
                  }`}
                />
              </>
            ) : (
              <>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-zinc-300">
                  <UserRound className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">
                    Đăng nhập / Tạo tài khoản
                  </p>
                  <p className="truncate text-[10px] text-emerald-400/90">
                    Đăng nhập để đồng bộ Server
                  </p>
                </div>
              </>
            )}
          </motion.button>
          {!isDesktopApp && (
            <Link
              href="/download"
              className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-colors ${
                pathname === "/download"
                  ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                  : "border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-300 hover:bg-emerald-500/20"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              Tải bản PC (.exe)
            </Link>
          )}
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Info className="h-3.5 w-3.5 text-emerald-400" />
            Giới thiệu HnBee Music
          </button>
          <BrandCredit className="mt-2 text-center" />
        </div>
      </aside>

      {/* MOBILE 4-TAB iOS HIG BOTTOM TAB BAR (Home Indicator safe-area aware) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-white/10 bg-zinc-950/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl md:hidden">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
                active ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
