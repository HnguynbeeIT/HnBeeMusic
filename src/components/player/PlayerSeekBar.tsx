"use client";

import type { TrackSource } from "@/lib/audio/types";
import { usePlaybackTimeStore } from "@/store/usePlaybackTimeStore";
import { getSourceTheme } from "@/lib/ui/source-theme";
import { SeekBar } from "./SeekBar";

interface PlayerSeekBarProps {
  source?: TrackSource;
  onSeek: (seconds: number) => void;
  disabled?: boolean;
}

/**
 * Leaf subscriber for SeekBar so only this tiny subtree re-renders as progress ticks.
 */
export function PlayerSeekBar({
  source,
  onSeek,
  disabled,
}: PlayerSeekBarProps) {
  const progress = usePlaybackTimeStore((s) => s.progress);
  const duration = usePlaybackTimeStore((s) => s.duration);

  return (
    <SeekBar
      progress={progress}
      duration={duration}
      source={source}
      onSeek={onSeek}
      disabled={disabled}
    />
  );
}

/**
 * Leaf subscriber for Mobile Mini Player hairline progress bar (GPU transform scaleX).
 */
export function MobileMiniProgressBar({ source }: { source?: TrackSource }) {
  const progress = usePlaybackTimeStore((s) => s.progress);
  const duration = usePlaybackTimeStore((s) => s.duration);
  const theme = getSourceTheme(source);
  const ratio =
    duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;

  return (
    <div className="h-0.5 w-full bg-white/10">
      <div
        className={`h-full w-full origin-left ${theme.barClass}`}
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  );
}
