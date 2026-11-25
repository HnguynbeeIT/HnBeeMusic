"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BadgeCheck, Loader2, Play } from "lucide-react";
import type { ArtistSearchItem } from "@/lib/audio/types";
import type { UnifiedArtistResponse } from "@/lib/adapters/artist";
import { ARTIST_REGION_META } from "@/lib/audio/region";
import { BUTTON_MOTION } from "@/lib/ui/source-theme";
import { usePlayerStore } from "@/store/usePlayerStore";
import { getByokHeaders } from "@/store/useSettingsStore";
import { TrackThumbnail } from "@/components/track/TrackThumbnail";
import { SourceBadge } from "@/components/track/SourceBadge";
import { buildArtistHref } from "./ArtistLink";

interface ArtistCardProps {
  artist: ArtistSearchItem;
  variant?: "strip" | "grid";
}

function formatFollowers(count?: number): string {
  if (!count || count <= 0) return "";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export function ArtistCard({ artist, variant = "strip" }: ArtistCardProps) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const [playingNow, setPlayingNow] = useState(false);

  const href = buildArtistHref(artist.name, artist.source, artist.artistId);
  const regionInfo = ARTIST_REGION_META[artist.region];

  const handleQuickPlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (playingNow) return;
    setPlayingNow(true);
    try {
      const params = new URLSearchParams({
        name: artist.name,
        source: "all",
        preferredSource: artist.source,
      });
      if (artist.artistId) params.set("id", artist.artistId);
      const res = await fetch(`/api/artist?${params.toString()}`, {
        headers: getByokHeaders(),
      });
      const data = (await res.json()) as UnifiedArtistResponse;
      if (res.ok && data.tracks?.length > 0) {
        playTrack(data.tracks[0], data.tracks);
      }
    } catch {
      // ignore
    } finally {
      setPlayingNow(false);
    }
  };

  if (variant === "grid") {
    return (
      <Link
        href={href}
        className="group relative flex flex-col items-center rounded-2xl border border-white/10 bg-zinc-900/60 p-4 text-center shadow-xl backdrop-blur-xl transition-colors hover:border-white/20 hover:bg-zinc-900/90"
      >
        <div className="relative mb-3">
          <TrackThumbnail
            src={artist.avatar}
            alt={artist.name}
            className="h-24 w-24 rounded-full ring-2 ring-white/15 transition-transform duration-300 group-hover:scale-105"
          />
          <motion.button
            type="button"
            {...BUTTON_MOTION}
            onClick={(e) => void handleQuickPlay(e)}
            aria-label={`Phát nhạc của ${artist.name}`}
            title="Phát nhạc nghệ sĩ"
            className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-950 shadow-xl opacity-95 transition-opacity group-hover:opacity-100"
          >
            {playingNow ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4 translate-x-[1px] fill-zinc-950" />
            )}
          </motion.button>
        </div>

        <div className="flex max-w-full items-center justify-center gap-1">
          <p className="truncate text-sm font-bold text-white">{artist.name}</p>
          {artist.verified && (
            <BadgeCheck className="h-4 w-4 shrink-0 text-sky-400" />
          )}
        </div>

        <p className="mt-1 text-[11px] text-zinc-400">
          {regionInfo.flag} {regionInfo.shortLabel} &bull; {artist.language}
        </p>

        <div className="mt-2 flex items-center justify-center gap-1.5">
          <SourceBadge source={artist.source} compact />
          {artist.followers && artist.followers > 0 && (
            <span className="font-mono text-[10px] tabular-nums text-zinc-500">
              {formatFollowers(artist.followers)} followers
            </span>
          )}
        </div>
      </Link>
    );
  }

  // Compact horizontal strip card
  return (
    <Link
      href={href}
      className="group relative flex w-60 shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-3 shadow-lg backdrop-blur-xl transition-colors hover:border-white/20 hover:bg-zinc-900/90"
    >
      <div className="relative shrink-0">
        <TrackThumbnail
          src={artist.avatar}
          alt={artist.name}
          className="h-12 w-12 rounded-full ring-2 ring-white/10 transition-transform duration-300 group-hover:scale-105"
        />
        <motion.button
          type="button"
          {...BUTTON_MOTION}
          onClick={(e) => void handleQuickPlay(e)}
          aria-label={`Phát nhạc của ${artist.name}`}
          className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-zinc-950 shadow-md opacity-0 transition-opacity group-hover:opacity-100"
        >
          {playingNow ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Play className="h-3 w-3 translate-x-[0.5px] fill-zinc-950" />
          )}
        </motion.button>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="truncate text-xs font-bold text-white">{artist.name}</p>
          {artist.verified && (
            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sky-400" />
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-zinc-400">
          {regionInfo.flag} {regionInfo.shortLabel} &bull; {artist.language}
        </p>
      </div>
    </Link>
  );
}
