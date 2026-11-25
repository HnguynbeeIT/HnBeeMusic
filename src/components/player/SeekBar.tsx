"use client";

import { useState } from "react";
import type { TrackSource } from "@/lib/audio/types";
import { formatDuration } from "@/lib/audio/normalize";
import { getSourceTheme } from "@/lib/ui/source-theme";

interface SeekBarProps {
  progress: number;
  duration: number;
  source?: TrackSource | null;
  onSeek: (seconds: number) => void;
  disabled?: boolean;
  showTime?: boolean;
}

export function SeekBar({
  progress,
  duration,
  source,
  onSeek,
  disabled = false,
  showTime = true,
}: SeekBarProps) {
  const [draggingValue, setDraggingValue] = useState<number | null>(null);
  const safeDuration = duration > 0 ? duration : 0;
  const currentValue =
    draggingValue !== null
      ? draggingValue
      : Math.min(progress, safeDuration || progress);
  const ratio =
    safeDuration > 0 ? Math.min(1, Math.max(0, currentValue / safeDuration)) : 0;
  const theme = getSourceTheme(source);

  return (
    <div className="flex w-full items-center gap-2.5">
      {showTime && (
        <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-400">
          {formatDuration(currentValue)}
        </span>
      )}

      <div className="group relative flex h-5 flex-1 items-center">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/15 transition-[transform] duration-150 group-hover:scale-y-150">
          <div
            className={`h-full w-full origin-left rounded-full transition-colors duration-300 ${theme.barClass}`}
            style={{ transform: `scaleX(${ratio})` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={safeDuration || 100}
          step={0.5}
          value={safeDuration > 0 ? currentValue : 0}
          disabled={disabled || safeDuration === 0}
          aria-label="Tua thời gian bài hát"
          onChange={(e) => setDraggingValue(Number(e.target.value))}
          onMouseUp={() => {
            if (draggingValue !== null) {
              onSeek(draggingValue);
              setDraggingValue(null);
            }
          }}
          onTouchEnd={() => {
            if (draggingValue !== null) {
              onSeek(draggingValue);
              setDraggingValue(null);
            }
          }}
          onKeyUp={() => {
            if (draggingValue !== null) {
              onSeek(draggingValue);
              setDraggingValue(null);
            }
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </div>

      {showTime && (
        <span className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
          {safeDuration > 0 ? formatDuration(safeDuration) : "--:--"}
        </span>
      )}
    </div>
  );
}
