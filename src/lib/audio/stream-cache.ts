"use client";

export interface CachedStreamEntry {
  youtubeId?: string;
  streamUrl: string;
  resolvedSource: "youtube" | "soundcloud";
  audioUrl?: string;
  updatedAt: number;
}

const STORAGE_KEY = "hnbee_stream_cache_v1";
const MAX_ENTRIES = 500;

let memoryCache: Record<string, CachedStreamEntry> | null = null;

function loadCache(): Record<string, CachedStreamEntry> {
  if (memoryCache) return memoryCache;
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      memoryCache = {};
      return memoryCache;
    }
    const parsed = JSON.parse(raw) as Record<string, CachedStreamEntry>;
    memoryCache = parsed && typeof parsed === "object" ? parsed : {};
    return memoryCache;
  } catch {
    memoryCache = {};
    return memoryCache;
  }
}

function persistCache(cache: Record<string, CachedStreamEntry>): void {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.entries(cache);
    if (entries.length > MAX_ENTRIES) {
      // Keep the 500 most recently used entries
      entries.sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0));
      const trimmed = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
      memoryCache = trimmed;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function getCachedStream(trackId: string): CachedStreamEntry | null {
  if (!trackId) return null;
  const cache = loadCache();
  const entry = cache[trackId];
  if (!entry?.streamUrl || !entry?.resolvedSource) return null;
  return entry;
}

export function setCachedStream(
  trackId: string,
  entry: Omit<CachedStreamEntry, "updatedAt">
): void {
  if (!trackId || !entry.streamUrl) return;
  const cache = loadCache();
  cache[trackId] = {
    ...entry,
    updatedAt: Date.now(),
  };
  persistCache(cache);
}
