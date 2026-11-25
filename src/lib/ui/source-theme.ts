import type { TrackSource } from "@/lib/audio/types";

export const SPRING_PHYSICS = {
  type: "spring" as const,
  stiffness: 380,
  damping: 32,
  mass: 0.8,
};

export const DRAWER_EASE = [0.22, 1, 0.36, 1] as const;

export const BUTTON_MOTION = {
  whileHover: { scale: 1.08 },
  whileTap: { scale: 0.92 },
  transition: SPRING_PHYSICS,
};

export interface SourceTheme {
  label: string;
  shortLabel: string;
  hex: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  barClass: string;
  glowShadow: string;
  ambientRadial: string;
}

export const SOURCE_THEMES: Record<TrackSource, SourceTheme> = {
  spotify: {
    label: "Spotify",
    shortLabel: "SP",
    hex: "#1DB954",
    textClass: "text-emerald-400",
    bgClass: "bg-emerald-500/10",
    borderClass: "border-emerald-400/25",
    barClass: "bg-[#1DB954]",
    glowShadow: "0 0 28px rgba(29, 185, 84, 0.45)",
    ambientRadial: "rgba(29, 185, 84, 0.45)",
  },
  youtube: {
    label: "YouTube",
    shortLabel: "YT",
    hex: "#FF0000",
    textClass: "text-rose-500",
    bgClass: "bg-rose-500/10",
    borderClass: "border-rose-500/25",
    barClass: "bg-[#FF0000]",
    glowShadow: "0 0 28px rgba(255, 0, 0, 0.45)",
    ambientRadial: "rgba(255, 0, 0, 0.42)",
  },
  soundcloud: {
    label: "SoundCloud",
    shortLabel: "SC",
    hex: "#FF5500",
    textClass: "text-orange-400",
    bgClass: "bg-orange-500/10",
    borderClass: "border-orange-400/25",
    barClass: "bg-[#FF5500]",
    glowShadow: "0 0 28px rgba(255, 85, 0, 0.45)",
    ambientRadial: "rgba(255, 85, 0, 0.45)",
  },
};

export function getSourceTheme(source?: TrackSource | null): SourceTheme {
  return SOURCE_THEMES[source ?? "spotify"];
}
