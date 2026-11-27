"use client";

import { usePlayerStore } from "@/store/usePlayerStore";
import { getSourceTheme } from "@/lib/ui/source-theme";

/**
 * Dynamic Ambient Lighting behind main viewport:
 * Uses HNG Obsidian Black (#0B0D12) base layered with HNM Neon Violet (#8B5CF6),
 * HNT Electric Cyan (#00E5FF), and artwork-derived bloom.
 */
export function AmbientGlow() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const theme = getSourceTheme(currentTrack?.source);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#0B0D12]"
    >
      {/* Artwork-derived ambient bloom */}
      {currentTrack?.thumbnail && (
        <div
          className="absolute -top-24 left-1/2 h-[480px] w-[860px] -translate-x-1/2 rounded-full bg-cover bg-center opacity-30 blur-[120px] transition-all duration-1000"
          style={{ backgroundImage: `url(${currentTrack.thumbnail})` }}
        />
      )}

      {/* HNM Neon Violet & active source radial ambient aura */}
      <div
        className="absolute -top-32 right-1/4 h-[420px] w-[620px] rounded-full opacity-30 blur-[120px] transition-all duration-1000"
        style={{
          background: `radial-gradient(circle, ${
            currentTrack ? theme.ambientRadial : "rgba(139, 92, 246, 0.45)"
          } 0%, transparent 70%)`,
        }}
      />

      {/* Subtle HNT Electric Cyan tech rim glow */}
      <div
        className="absolute -bottom-32 left-1/4 h-[340px] w-[520px] rounded-full opacity-15 blur-[130px]"
        style={{
          background:
            "radial-gradient(circle, rgba(0, 229, 255, 0.4) 0%, transparent 70%)",
        }}
      />

      {/* Deep Obsidian Black vignette to keep album art & glass crisp */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B0D12]/25 via-[#0B0D12]/80 to-[#0B0D12]" />
    </div>
  );
}
