"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AudioWaveform } from "lucide-react";
import { usePlayerStore } from "@/store/usePlayerStore";
import { SPRING_PHYSICS } from "@/lib/ui/source-theme";

interface BrandLogoProps {
  variant?: "full" | "compact";
  className?: string;
}

export function BrandLogo({
  variant = "full",
  className = "",
}: BrandLogoProps) {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [failed, setFailed] = useState(false);

  const sizeClass =
    variant === "full"
      ? "h-16 w-auto object-contain"
      : "h-9 w-auto object-contain";

  return (
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      animate={
        isPlaying
          ? { opacity: [0.92, 1, 0.92] }
          : { opacity: 1 }
      }
      transition={
        isPlaying
          ? {
              opacity: { duration: 2.2, repeat: Infinity, ease: "easeInOut" },
              scale: SPRING_PHYSICS,
            }
          : SPRING_PHYSICS
      }
      className={`inline-flex shrink-0 items-center select-none transition-[filter] duration-500 ${
        isPlaying
          ? "drop-shadow-[0_0_14px_rgba(255,255,255,0.28)]"
          : "drop-shadow-none"
      } ${className}`}
    >
      {failed ? (
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <AudioWaveform className="h-4 w-4" />
          </span>
          <span>HnBee Music</span>
        </span>
      ) : (
        <img
          src="/brand/logo-white.png"
          alt="HnBee Music"
          onError={() => setFailed(true)}
          className={sizeClass}
        />
      )}
    </motion.div>
  );
}
