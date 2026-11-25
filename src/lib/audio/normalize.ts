import type { TrackSource } from "./types";

/**
 * Automatically upgrades thumbnail quality per audio-adapter skill:
 * - YouTube: default.jpg / mqdefault.jpg / hqdefault.jpg -> maxresdefault.jpg
 * - SoundCloud: -large -> -t500x500
 */
export function upgradeThumbnail(url: string, source: TrackSource): string {
  if (!url) return "";

  if (source === "youtube") {
    return url.replace(
      /\/(default|mqdefault|hqdefault|sddefault)\.(jpg|webp)(\?.*)?$/i,
      "/maxresdefault.$2$3"
    );
  }

  if (source === "soundcloud") {
    return url.replace(/-large\.(jpg|png|jpeg)/i, "-t500x500.$1");
  }

  return url;
}

/**
 * Fallback thumbnail URL when high-res artwork fails to load (e.g. YouTube
 * videos without maxresdefault.jpg).
 */
export function getFallbackThumbnail(url: string): string | null {
  if (!url) return null;
  if (/maxresdefault\.(jpg|webp)/i.test(url)) {
    return url.replace(/maxresdefault\.(jpg|webp)/i, "hqdefault.$1");
  }
  if (/-t500x500\./i.test(url)) {
    return url.replace(/-t500x500\./i, "-large.");
  }
  return null;
}

/**
 * Formats seconds into mm:ss or h:mm:ss for tabular-nums display.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const paddedSecs = secs.toString().padStart(2, "0");

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${paddedSecs}`;
  }
  return `${mins}:${paddedSecs}`;
}

/**
 * Parses YouTube ISO 8601 duration strings (e.g. "PT4M13S") into seconds.
 */
export function parseISO8601Duration(iso?: string): number {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = Number.parseInt(match[1] || "0", 10);
  const minutes = Number.parseInt(match[2] || "0", 10);
  const seconds = Number.parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}
