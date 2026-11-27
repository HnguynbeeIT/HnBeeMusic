"use client";

export interface CachedStreamEntry {
  youtubeId?: string;
  streamUrl: string;
  resolvedSource: "youtube" | "soundcloud" | "zingmp3";
  matchedTitle?: string;
  matchScore?: number;
  audioUrl?: string;
  audioUrlUpdatedAt?: number;
  updatedAt: number;
}

const LEGACY_STORAGE_KEYS = ["hnbee_stream_cache_v1"];
const STORAGE_KEY = "hnbee_stream_cache_v2";
const MAX_ENTRIES = 500;
// Signed direct audio URLs (e.g. googlevideo.com / sndcdn.com) stay fresh for ~2 hours
const DIRECT_AUDIO_TTL_MS = 2 * 60 * 60 * 1000;

let memoryCache: Record<string, CachedStreamEntry> | null = null;
let legacyPurged = false;

/**
 * Deletes legacy `hnbee_stream_cache_v1` from localStorage on startup
 * so any mis-matched Spotify streams from older versions are completely wiped.
 */
export function purgeLegacyStreamCache(): void {
  if (legacyPurged || typeof window === "undefined") return;
  legacyPurged = true;
  try {
    for (const oldKey of LEGACY_STORAGE_KEYS) {
      if (window.localStorage.getItem(oldKey) !== null) {
        window.localStorage.removeItem(oldKey);
      }
    }
  } catch {
    // Ignore private-browsing storage restrictions
  }
}

function loadCache(): Record<string, CachedStreamEntry> {
  purgeLegacyStreamCache();
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
  const existing = cache[trackId];
  cache[trackId] = {
    ...existing,
    ...entry,
    updatedAt: Date.now(),
  };
  persistCache(cache);
}

export function getCachedDirectAudioUrl(trackId: string): string | null {
  if (!trackId) return null;
  const cache = loadCache();
  const entry = cache[trackId];
  if (!entry?.audioUrl) return null;
  const age = Date.now() - (entry.audioUrlUpdatedAt || entry.updatedAt || 0);
  if (age > DIRECT_AUDIO_TTL_MS) return null;
  return entry.audioUrl;
}

export function setCachedDirectAudioUrl(
  trackId: string,
  audioUrl: string,
  fallbackMeta?: {
    streamUrl: string;
    resolvedSource: "youtube" | "soundcloud" | "zingmp3";
    youtubeId?: string;
    matchedTitle?: string;
    matchScore?: number;
  }
): void {
  if (!trackId || !audioUrl) return;
  const cache = loadCache();
  const existing = cache[trackId];
  const now = Date.now();
  cache[trackId] = {
    streamUrl: existing?.streamUrl || fallbackMeta?.streamUrl || audioUrl,
    resolvedSource:
      existing?.resolvedSource || fallbackMeta?.resolvedSource || "youtube",
    youtubeId: existing?.youtubeId || fallbackMeta?.youtubeId,
    matchedTitle: existing?.matchedTitle || fallbackMeta?.matchedTitle,
    matchScore: existing?.matchScore ?? fallbackMeta?.matchScore,
    audioUrl,
    audioUrlUpdatedAt: now,
    updatedAt: now,
  };
  persistCache(cache);
}

export function clearCachedDirectAudioUrl(trackId: string): void {
  if (!trackId) return;
  const cache = loadCache();
  const existing = cache[trackId];
  if (!existing?.audioUrl) return;
  delete existing.audioUrl;
  delete existing.audioUrlUpdatedAt;
  persistCache(cache);
}
