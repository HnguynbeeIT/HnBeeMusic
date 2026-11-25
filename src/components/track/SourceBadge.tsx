"use client";

import type { TrackSource } from "@/lib/audio/types";

interface SourceBadgeProps {
  source: TrackSource;
  resolvedSource?: "youtube" | "soundcloud";
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
};

export function SourceBadge({
  source,
  resolvedSource,
  compact = false,
}: SourceBadgeProps) {
  const meta = SOURCE_META[source];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide ${meta.bgClass} ${meta.colorClass}`}
      title={
        source === "spotify" && resolvedSource
          ? `Spotify metadata · phát qua ${resolvedSource}`
          : meta.label
      }
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
      {!compact && (
        <span>
          {meta.label}
          {source === "spotify" && resolvedSource
            ? ` → ${resolvedSource === "youtube" ? "YT" : "SC"}`
            : ""}
        </span>
      )}
    </span>
  );
}
