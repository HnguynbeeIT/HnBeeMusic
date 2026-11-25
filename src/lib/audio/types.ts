export type TrackSource = "youtube" | "soundcloud" | "spotify";

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
   * Direct audio stream URL, or for Spotify tracks, the lazily matched
   * YouTube/SoundCloud URL used by AudioEngineHost for full playback.
   */
  streamUrl?: string;
  /**
   * Actual playback engine when source === 'spotify' after lazy matching.
   */
  resolvedSource?: "youtube" | "soundcloud";
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
  region: "VN" | "US" | "KR" | "JP";
  language: string;
  sourceUrl?: string;
}

export interface SearchResponse {
  tracks: UnifiedTrack[];
  artists?: ArtistSearchItem[];
  sources: {
    youtube: "live" | "fallback" | "error";
    soundcloud: "live" | "fallback" | "error";
    spotify: "live" | "fallback" | "error";
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
