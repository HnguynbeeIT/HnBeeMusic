/**
 * HnBeeMusic — Multi-Platform Audio Core Types
 * Strict TypeScript definitions for the unified Adapter Pattern and Stream Proxy.
 */

export type PlatformSource =
  | "youtube"
  | "soundcloud"
  | "zingmp3"
  | "nct"
  | "spotify"
  | "apple_music"
  | "deezer"
  | "tidal"
  | "bandcamp"
  | "jamendo";

export const SUPPORTED_PLATFORM_SOURCES: readonly PlatformSource[] = [
  "youtube",
  "soundcloud",
  "zingmp3",
  "nct",
  "spotify",
  "apple_music",
  "deezer",
  "tidal",
  "bandcamp",
  "jamendo",
] as const;

export type UnifiedTrackId = `${PlatformSource}:${string}`;

export type StreamQuality = "128kbps" | "320kbps" | "lossless";

export interface UnifiedTrack {
  id: string;
  unifiedId: UnifiedTrackId;
  source: PlatformSource;
  title: string;
  artists: string[];
  thumbnail: string;
  duration: number; // seconds
  isStreamable: boolean;
  requiresSdk?: boolean;
  album?: string;
  sourceUrl?: string;
}

export interface StreamData {
  url: string;
  quality: StreamQuality;
  expiresAt?: number; // Unix timestamp in milliseconds
  headers?: Record<string, string>;
  mimeType?: string;
  requiresSdk?: boolean;
  sdkUri?: string;
}

export interface SyncedLyricLine {
  timeMs: number;
  text: string;
}

export interface LyricsData {
  synced: boolean;
  lines: SyncedLyricLine[];
  plainText?: string;
  lrcUrl?: string;
}

export interface IAudioAdapter {
  readonly source: PlatformSource;
  search(query: string, limit?: number): Promise<UnifiedTrack[]>;
  getTrackInfo(id: string): Promise<UnifiedTrack | null>;
  getStreamUrl(id: string): Promise<StreamData | null>;
  getLyrics?(id: string): Promise<LyricsData | null>;
}

export interface AdapterSearchError {
  source: PlatformSource;
  message: string;
}

export interface AggregatedSearchResult {
  query: string;
  tracks: UnifiedTrack[];
  byPlatform: Partial<Record<PlatformSource, UnifiedTrack[]>>;
  errors: AdapterSearchError[];
  durationMs: number;
}

export function isPlatformSource(value: string): value is PlatformSource {
  return (SUPPORTED_PLATFORM_SOURCES as readonly string[]).includes(value);
}

export function buildUnifiedId(
  source: PlatformSource,
  id: string
): UnifiedTrackId {
  return `${source}:${id}`;
}

export function parseUnifiedId(
  unifiedId: string
): { source: PlatformSource; id: string } | null {
  const decoded = decodeURIComponent(unifiedId).trim();
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex <= 0) return null;

  const rawSource = decoded.slice(0, separatorIndex).toLowerCase();
  const id = decoded.slice(separatorIndex + 1).trim();
  if (!id || !isPlatformSource(rawSource)) return null;

  return { source: rawSource, id };
}
