"use client";

import { usePlayerStore } from "@/store/usePlayerStore";
import { getSourceTheme } from "@/lib/ui/source-theme";

/**
 * Dynamic Ambient Lighting behind main viewport:
 * blur-[120px] opacity-30 transition-all duration-1000
 * shifts automatically with the active track artwork & source palette.
 */
export function AmbientGlow() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const theme = getSourceTheme(currentTrack?.source);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#09090b]"
    >
      {/* Artwork-derived ambient bloom */}
      {currentTrack?.thumbnail && (
        <div
          className="absolute -top-24 left-1/2 h-[480px] w-[860px] -translate-x-1/2 rounded-full bg-cover bg-center opacity-30 blur-[120px] transition-all duration-1000"
          style={{ backgroundImage: `url(${currentTrack.thumbnail})` }}
        />
      )}

      {/* Source-tinted radial ambient aura */}
      <div
        className="absolute -top-32 right-1/4 h-[420px] w-[620px] rounded-full opacity-30 blur-[120px] transition-all duration-1000"
        style={{
          background: `radial-gradient(circle, ${theme.ambientRadial} 0%, transparent 70%)`,
        }}
      />

      {/* Deep obsidian vignette to keep album art & glass crisp */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#09090b]/25 via-[#09090b]/80 to-[#09090b]" />
    </div>
  );
}
