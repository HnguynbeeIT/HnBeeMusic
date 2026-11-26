"use client";

export interface VolumeRampOptions {
  from: number;
  to: number;
  durationMs: number;
  onStep: (volume: number) => void;
  onComplete?: () => void;
}

/**
 * Smooth equal-power cosine volume ramp driven by requestAnimationFrame.
 * 100% compatible with Desktop, Android, and iOS Safari (no Web Audio graph rerouting).
 * Returns a cancel() function to immediately abort the ramp on rapid track switches or unmount.
 */
export function smoothVolumeRamp({
  from,
  to,
  durationMs,
  onStep,
  onComplete,
}: VolumeRampOptions): () => void {
  const startVal = Math.max(0, Math.min(100, from));
  const endVal = Math.max(0, Math.min(100, to));

  if (
    typeof window === "undefined" ||
    durationMs <= 16 ||
    Math.abs(endVal - startVal) < 0.5
  ) {
    onStep(endVal);
    onComplete?.();
    return () => {};
  }

  let rafId: number | null = null;
  let cancelled = false;
  const startTime = performance.now();

  const tick = (now: number) => {
    if (cancelled) return;
    const elapsed = now - startTime;
    const progress = Math.min(1, Math.max(0, elapsed / durationMs));
    // Smooth cosine S-curve (equal-power feel, zero audio pop)
    const eased = 0.5 - 0.5 * Math.cos(Math.PI * progress);
    const current = startVal + (endVal - startVal) * eased;
    onStep(current);

    if (progress < 1) {
      rafId = window.requestAnimationFrame(tick);
    } else {
      rafId = null;
      onComplete?.();
    }
  };

  rafId = window.requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    if (rafId !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}
