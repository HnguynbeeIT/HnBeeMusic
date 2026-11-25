"use client";

import Link from "next/link";
import type { TrackSource } from "@/lib/audio/types";

interface ArtistLinkProps {
  name: string;
  source?: TrackSource;
  artistId?: string;
  className?: string;
  onNavigate?: () => void;
}

/**
 * Extracts primary artist name (before comma / · / feat.) for clean artist routing.
 */
export function getPrimaryArtistName(raw: string): string {
  const cleaned = raw
    .split(/,|·|&|feat\.|ft\./i)[0]
    ?.trim();
  return cleaned || raw.trim();
}

export function buildArtistHref(
  name: string,
  source?: TrackSource,
  artistId?: string
): string {
  const primary = getPrimaryArtistName(name);
  const params = new URLSearchParams();
  if (source) params.set("source", source);
  if (artistId) params.set("artistId", artistId);
  const qs = params.toString();
  return `/artist/${encodeURIComponent(primary)}${qs ? `?${qs}` : ""}`;
}

export function ArtistLink({
  name,
  source,
  artistId,
  className = "",
  onNavigate,
}: ArtistLinkProps) {
  const href = buildArtistHref(name, source, artistId);

  return (
    <Link
      href={href}
      onClick={(e) => {
        e.stopPropagation();
        onNavigate?.();
      }}
      className={`truncate underline-offset-2 transition-colors hover:text-white hover:underline ${className}`}
    >
      {name}
    </Link>
  );
}
