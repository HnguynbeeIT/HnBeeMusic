"use client";

export function TrackSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Đang tải bài hát">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse items-center gap-3 rounded-xl border border-white/[0.04] bg-zinc-900/50 px-3 py-2.5"
        >
          <div className="hidden h-4 w-5 rounded bg-zinc-800 sm:block" />
          <div className="h-11 w-11 shrink-0 rounded-lg bg-zinc-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-2/5 rounded bg-zinc-800" />
            <div className="h-3 w-1/4 rounded bg-zinc-800/70" />
          </div>
          <div className="hidden h-5 w-20 rounded-full bg-zinc-800 sm:block" />
          <div className="h-3.5 w-10 rounded bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}
