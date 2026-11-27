"use client";

import type { TrackSource } from "@/lib/audio/types";

interface SourceBadgeProps {
  source: TrackSource;
  resolvedSource?: "youtube" | "soundcloud" | "zingmp3";
  compact?: boolean;
}

const SOURCE_META: Record<
  TrackSource,
  { label: string; colorClass: string; dotClass: string; bgClass: string }
> = {
  spotify: {
    label: "Spotify",
    colorClass: "text-emerald-400",
    dotClass: "bg-emerald-400",
    bgClass: "bg-emerald-400/10 border-emerald-400/20",
  },
  youtube: {
    label: "YouTube",
    colorClass: "text-rose-500",
    dotClass: "bg-rose-500",
    bgClass: "bg-rose-500/10 border-rose-500/20",
  },
  soundcloud: {
    label: "SoundCloud",
    colorClass: "text-orange-400",
    dotClass: "bg-orange-400",
    bgClass: "bg-orange-400/10 border-orange-400/20",
  },
  zingmp3: {
    label: "Zing MP3",
    colorClass: "text-violet-400",
    dotClass: "bg-violet-400",
    bgClass: "bg-violet-400/10 border-violet-400/25",
  },
  nhaccuatui: {
    label: "NhacCuaTui",
    colorClass: "text-sky-400",
    dotClass: "bg-sky-400",
    bgClass: "bg-sky-400/10 border-sky-400/25",
  },
  apple_music: {
    label: "Apple Music",
    colorClass: "text-pink-400",
    dotClass: "bg-pink-400",
    bgClass: "bg-pink-400/10 border-pink-400/25",
  },
  audius: {
    label: "Audius",
    colorClass: "text-fuchsia-400",
    dotClass: "bg-fuchsia-400",
    bgClass: "bg-fuchsia-400/10 border-fuchsia-400/25",
  },
};

export function SourceBadge({
  source,
  resolvedSource,
  compact = false,
}: SourceBadgeProps) {
  const meta = SOURCE_META[source] ?? SOURCE_META.spotify;
  const isBridged =
    (source === "spotify" || source === "apple_music") && Boolean(resolvedSource);

  const resolvedShort =
    resolvedSource === "youtube"
      ? "YT"
      : resolvedSource === "zingmp3"
      ? "ZM"
      : "SC";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide ${meta.bgClass} ${meta.colorClass}`}
      title={
        isBridged
          ? `${meta.label} metadata · phát qua ${resolvedSource}`
          : meta.label
      }
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
      {!compact && (
        <span>
          {meta.label}
          {isBridged ? ` → ${resolvedShort}` : ""}
        </span>
      )}
    </span>
  );
}
