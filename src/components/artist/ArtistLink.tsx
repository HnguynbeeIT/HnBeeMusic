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
 * Extracts canonical primary artist name (before comma / · / feat. and stripping
 * channel suffixes like Official / Offical / - Topic / VEVO) so YouTube channels
 * like "Guyn Official" and Spotify artists like "guyn" unify into ONE artist page.
 */
export function getPrimaryArtistName(raw: string): string {
  const first = raw.split(/,|·|&|feat\.|ft\./i)[0]?.trim() || raw.trim();
  const canonical = first
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .replace(/\s+\b(official|offical|music|channel)\b$/i, "")
    .trim();
  return canonical || first;
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
