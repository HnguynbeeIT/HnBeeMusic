export type TrackSource =
  | "youtube"
  | "soundcloud"
  | "spotify"
  | "zingmp3"
  | "nhaccuatui"
  | "apple_music"
  | "audius";

export type RepeatMode = "off" | "all" | "one";

export interface UnifiedTrack {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number; // seconds
  source: TrackSource;
  sourceUrl: string;
  /**
   * Direct audio stream URL (e.g. `/api/providers/zingmp3?action=stream&id=...`),
   * or for Spotify / Apple Music tracks, the lazily matched bridge URL used for full playback.
   */
  streamUrl?: string;
  /**
   * Actual playback engine when source === 'spotify' or 'apple_music' after lazy bridge matching.
   */
  resolvedSource?: "youtube" | "soundcloud" | "zingmp3";
  /**
   * True when a SoundCloud Go+ track is restricted to a 30s snippet preview.
   */
  isSnippet?: boolean;
  /**
   * Matched video/audio title & strict score from Lazy Matching.
   */
  matchedTitle?: string;
  matchScore?: number;
}

export interface AdapterLyricsResult {
  synced: Array<{ time: number; text: string }>;
  plain: string | null;
  source: string;
}

export interface AudioAdapter {
  readonly source: TrackSource;
  canHandleUrl(url: string): boolean;
  search(query: string, limit?: number): Promise<UnifiedTrack[]>;
  resolveUrl(url: string): Promise<ResolveResponse | null>;
  getStreamUrl(track: UnifiedTrack): Promise<string | null>;
  getLyrics(track: UnifiedTrack): Promise<AdapterLyricsResult | null>;
}

export interface ArtistSearchItem {
  id: string;
  name: string;
  avatar: string;
  avatarUrl: string;
  source: TrackSource;
  artistId?: string;
  href: string;
  followers?: number;
  genres: string[];
  verified: boolean;
  region: "VN" | "US" | "KR" | "JP" | "OTHER";
  language: string;
  sourceUrl?: string;
}

export interface SearchResponse {
  tracks: UnifiedTrack[];
  artists?: ArtistSearchItem[];
  youtubeStatus?: "api" | "fallback" | "error";
  sources: {
    youtube: "live" | "fallback" | "error";
    soundcloud: "live" | "fallback" | "error";
    spotify: "live" | "fallback" | "error";
    zingmp3?: "live" | "fallback" | "error";
    nhaccuatui?: "live" | "fallback" | "error";
    apple_music?: "live" | "fallback" | "error";
    audius?: "live" | "fallback" | "error";
  };
  cached?: boolean;
}

export interface ResolveResponse {
  type: "track" | "playlist" | "album" | "artist";
  title?: string;
  artistId?: string;
  artistName?: string;
  tracks: UnifiedTrack[];
}
