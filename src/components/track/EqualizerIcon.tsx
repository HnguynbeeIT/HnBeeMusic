"use client";

interface EqualizerIconProps {
  playing?: boolean;
  className?: string;
}

export function EqualizerIcon({
  playing = true,
  className = "h-3.5 w-3.5",
}: EqualizerIconProps) {
  return (
    <span
      aria-label="Now playing"
      className={`inline-flex items-end justify-between gap-[2px] ${className}`}
    >
      <span
        className={`w-[3px] rounded-full bg-amber-400 transition-all ${
          playing ? "animate-eq-1" : "h-[30%]"
        }`}
      />
      <span
        className={`w-[3px] rounded-full bg-amber-400 transition-all ${
          playing ? "animate-eq-2" : "h-[60%]"
        }`}
      />
      <span
        className={`w-[3px] rounded-full bg-amber-400 transition-all ${
          playing ? "animate-eq-3" : "h-[40%]"
        }`}
      />
    </span>
  );
}
