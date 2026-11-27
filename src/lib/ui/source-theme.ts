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
  zingmp3: {
    label: "Zing MP3",
    shortLabel: "ZM",
    hex: "#8B5CF6",
    textClass: "text-violet-400",
    bgClass: "bg-violet-500/10",
    borderClass: "border-violet-400/25",
    barClass: "bg-[#8B5CF6]",
    glowShadow: "0 0 28px rgba(139, 92, 246, 0.45)",
    ambientRadial: "rgba(139, 92, 246, 0.45)",
  },
  nhaccuatui: {
    label: "NhacCuaTui",
    shortLabel: "NCT",
    hex: "#0EA5E9",
    textClass: "text-sky-400",
    bgClass: "bg-sky-500/10",
    borderClass: "border-sky-400/25",
    barClass: "bg-[#0EA5E9]",
    glowShadow: "0 0 28px rgba(14, 165, 233, 0.45)",
    ambientRadial: "rgba(14, 165, 233, 0.45)",
  },
  apple_music: {
    label: "Apple Music",
    shortLabel: "AM",
    hex: "#FA243C",
    textClass: "text-pink-400",
    bgClass: "bg-pink-500/10",
    borderClass: "border-pink-400/25",
    barClass: "bg-[#FA243C]",
    glowShadow: "0 0 28px rgba(250, 36, 60, 0.45)",
    ambientRadial: "rgba(250, 36, 60, 0.45)",
  },
  audius: {
    label: "Audius",
    shortLabel: "AU",
    hex: "#CC0FE0",
    textClass: "text-fuchsia-400",
    bgClass: "bg-fuchsia-500/10",
    borderClass: "border-fuchsia-400/25",
    barClass: "bg-[#CC0FE0]",
    glowShadow: "0 0 28px rgba(204, 15, 224, 0.45)",
    ambientRadial: "rgba(204, 15, 224, 0.45)",
  },
};

export function getSourceTheme(source?: TrackSource | null): SourceTheme {
  return SOURCE_THEMES[source ?? "spotify"] ?? SOURCE_THEMES.spotify;
}
