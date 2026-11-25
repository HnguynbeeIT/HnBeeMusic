"use client";

import { motion } from "framer-motion";
import type { TrackSource } from "@/lib/audio/types";
import { getSourceTheme } from "@/lib/ui/source-theme";

interface AudioEqualizerProps {
  playing?: boolean;
  source?: TrackSource | null;
  className?: string;
}

const BARS = [
  {
    keyframes: [0.28, 1, 0.45, 0.85, 0.28],
    duration: 0.9,
    delay: 0,
    idleScale: 0.35,
  },
  {
    keyframes: [0.85, 0.3, 1, 0.4, 0.85],
    duration: 0.72,
    delay: 0.12,
    idleScale: 0.65,
  },
  {
    keyframes: [0.4, 0.9, 0.25, 0.95, 0.4],
    duration: 0.82,
    delay: 0.24,
    idleScale: 0.45,
  },
];

/**
 * 60fps GPU-accelerated 3-bar equalizer using scaleY transforms only.
 */
export function AudioEqualizer({
  playing = true,
  source,
  className = "h-3.5 w-3.5",
}: AudioEqualizerProps) {
  const theme = getSourceTheme(source);

  return (
    <span
      aria-label="Now playing"
      className={`inline-flex items-end justify-between gap-[2px] ${className}`}
    >
      {BARS.map((bar, idx) => (
        <motion.span
          key={idx}
          style={{ originY: 1 }}
          className={`h-full w-[3px] rounded-full ${theme.barClass}`}
          animate={
            playing
              ? { scaleY: bar.keyframes }
              : { scaleY: bar.idleScale }
          }
          transition={
            playing
              ? {
                  duration: bar.duration,
                  delay: bar.delay,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
              : { duration: 0.25, ease: "easeOut" }
          }
        />
      ))}
    </span>
  );
}
