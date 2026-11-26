"use client";

import { ListMusic } from "lucide-react";
import type { UnifiedTrack } from "@/lib/audio/types";
import { TrackThumbnail } from "@/components/track/TrackThumbnail";

interface PlaylistCoverProps {
  name: string;
  coverUrl?: string;
  tracks: UnifiedTrack[];
  className?: string;
}

/**
 * Renders a custom playlist cover URL if provided,
 * otherwise builds a 2x2 collage grid from the first 4 unique track thumbnails.
 */
export function PlaylistCover({
  name,
  coverUrl,
  tracks,
  className = "h-12 w-12 rounded-xl",
}: PlaylistCoverProps) {
  if (coverUrl?.trim()) {
    return (
      <TrackThumbnail src={coverUrl} alt={name} className={className} />
    );
  }

  const uniqueThumbs: string[] = [];
  for (const t of tracks) {
    if (t.thumbnail && !uniqueThumbs.includes(t.thumbnail)) {
      uniqueThumbs.push(t.thumbnail);
      if (uniqueThumbs.length === 4) break;
    }
  }

  if (uniqueThumbs.length >= 4) {
    return (
      <div
        className={`grid grid-cols-2 grid-rows-2 overflow-hidden bg-zinc-900 ${className}`}
      >
        {uniqueThumbs.map((src, i) => (
          <TrackThumbnail
            key={`${src}-${i}`}
            src={src}
            alt={`${name} ${i + 1}`}
            className="h-full w-full rounded-none"
          />
        ))}
      </div>
    );
  }

  if (uniqueThumbs.length >= 1) {
    return (
      <TrackThumbnail
        src={uniqueThumbs[0]}
        alt={name}
        className={className}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-emerald-500/20 via-zinc-900 to-zinc-800 text-emerald-400 ring-1 ring-white/10 ${className}`}
    >
      <ListMusic className="h-1/2 w-1/2 max-h-10 max-w-10 opacity-80" />
    </div>
  );
}
