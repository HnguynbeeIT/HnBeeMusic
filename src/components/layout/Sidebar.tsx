"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Compass,
  Flame,
  Library,
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
import { getInitials } from "@/components/auth/AuthModal";

const NAV_ITEMS = [
  { href: "/", label: "Khám phá", icon: Compass },
  { href: "/trending", label: "Trending", icon: Flame },
  { href: "/library", label: "Thư viện", icon: Library },
];

const MOBILE_NAV_ITEMS = [
  { href: "/", label: "Khám phá", icon: Compass },
  { href: "/search", label: "Tìm kiếm", icon: Search },
  { href: "/trending", label: "Trending", icon: Flame },
  { href: "/library", label: "Thư viện", icon: Library },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [quickQuery, setQuickQuery] = useState("");

  const likedCount = usePlayerStore((s) => s.likedTracks.length);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const setSettingsOpen = useSettingsStore((s) => s.setSettingsOpen);
  const hasCustomKeys = useSettingsStore((s) =>
    Boolean(
      s.youtubeApiKey ||
        (s.spotifyClientId && s.spotifyClientSecret) ||
        s.soundcloudClientId
    )
  );

  const user = useAuthStore((s) => s.user);
  const authMode = useAuthStore((s) => s.authMode);
  const initAuth = useAuthStore((s) => s.initAuth);
  const setAuthModalOpen = useAuthStore((s) => s.setAuthModalOpen);
  const userPlaylists = usePlaylistStore((s) => s.playlists);
  const followedArtists = useArtistStore((s) => s.followedArtists);

  useEffect(() => {
    void initAuth();
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
      {/* MOBILE TOP GLASS HEADER */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#09090b]/80 px-4 py-2.5 backdrop-blur-xl md:hidden">
        <Link href="/" aria-label="HnBee Music Home">
          <BrandLogo variant="compact" />
        </Link>
        <motion.button
          type="button"
          {...BUTTON_MOTION}
          onClick={() => setSettingsOpen(true)}
          aria-label="API Settings (BYOK)"
          className="relative rounded-xl border border-white/10 bg-zinc-900/70 p-2 text-zinc-300"
        >
          <Settings className="h-4 w-4" />
          {hasCustomKeys && (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
          )}
        </motion.button>
      </header>

      {/* DESKTOP FLOATING GLASS SIDEBAR (w-64 m-2 rounded-2xl) */}
      <aside className="fixed bottom-28 left-0 top-0 z-30 m-2 hidden w-64 flex-col rounded-2xl border border-white/10 bg-zinc-900/60 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl md:flex">
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
            <Link
              href="/library"
              className="text-[11px] text-zinc-400 hover:text-white"
            >
              + Quản lý
            </Link>
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

            {userPlaylists.map((pl) => (
              <button
                key={pl.id}
                type="button"
                onClick={() =>
                  pl.tracks.length > 0
                    ? playTrack(pl.tracks[0], pl.tracks)
                    : router.push("/library")
                }
                className="group flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors hover:bg-white/5"
              >
                <div className="relative shrink-0">
                  <TrackThumbnail
                    src={pl.tracks[0]?.thumbnail}
                    alt={pl.name}
                    className="h-10 w-10 rounded-lg"
                  />
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <Play className="h-3.5 w-3.5 translate-x-[1px] fill-white text-white" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-emerald-300 group-hover:text-emerald-200">
                    {pl.name}
                  </p>
                  <p className="truncate text-[11px] text-zinc-500">
                    {pl.tracks.length} bài · Cá nhân
                  </p>
                </div>
              </button>
            ))}

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

        {/* Bottom Zero-Verification Auth Trigger / Profile Card */}
        <div className="mt-3 border-t border-white/10 pt-3">
          <motion.button
            type="button"
            {...BUTTON_MOTION}
            onClick={() => setAuthModalOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-left transition-colors hover:bg-white/10"
          >
            {user ? (
              <>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 text-xs font-bold text-zinc-950">
                  {getInitials(user.displayName || user.username)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">
                    {user.displayName}
                  </p>
                  <p className="truncate font-mono text-[10px] text-zinc-400">
                    @{user.username}
                  </p>
                </div>
                <span
                  title={
                    authMode === "cloud"
                      ? "Cloud DB Sync"
                      : "Local Browser Profile"
                  }
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    authMode === "cloud" ? "bg-emerald-400" : "bg-amber-400"
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
                  <p className="truncate text-[10px] text-zinc-500">
                    {authMode === "cloud"
                      ? "Cloud DB Sync"
                      : "Local Browser Profile"}
                  </p>
                </div>
              </>
            )}
          </motion.button>
          <BrandCredit className="mt-2.5 text-center" />
        </div>
      </aside>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-5 border-t border-white/10 bg-zinc-900/90 backdrop-blur-xl md:hidden">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
                active ? "text-white" : "text-zinc-500"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setAuthModalOpen(true)}
          className="relative flex flex-col items-center justify-center gap-1 text-[10px] font-medium text-zinc-400 hover:text-white"
        >
          {user ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-[9px] font-bold text-zinc-950">
              {getInitials(user.displayName || user.username)}
            </span>
          ) : (
            <UserRound className="h-5 w-5" />
          )}
          <span className="max-w-[56px] truncate">
            {user ? user.username : "Tài khoản"}
          </span>
        </button>
      </nav>
    </>
  );
}
