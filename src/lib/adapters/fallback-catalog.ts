import type { UnifiedTrack } from "@/lib/audio/types";
import { upgradeThumbnail } from "@/lib/audio/normalize";

export interface CuratedPlaylist {
  id: string;
  name: string;
  subtitle: string;
  thumbnail: string;
  accentColor: string;
  trackIds: string[];
}

/**
 * 10 curated real, embeddable tracks across Spotify, YouTube, and SoundCloud
 * with crisp high-res artwork for instant testing and audiophile showcase.
 */
export const FALLBACK_CATALOG: UnifiedTrack[] = [
  {
    id: "sp:4cOdK2wGLETKBW3PvgPWqT",
    title: "Sky High (Audiophile Edition)",
    artist: "Elektronomia",
    thumbnail: upgradeThumbnail(
      "https://i.ytimg.com/vi/TW9d8vYrVFQ/hqdefault.jpg",
      "youtube"
    ),
    duration: 238,
    source: "spotify",
    sourceUrl: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
    streamUrl: "https://www.youtube.com/watch?v=TW9d8vYrVFQ",
    resolvedSource: "youtube",
  },
  {
    id: "sp:0VjIjW4GlUZAMYd2vXMi3b",
    title: "Heroes Tonight (feat. Johnning)",
    artist: "Janji",
    thumbnail: upgradeThumbnail(
      "https://i.ytimg.com/vi/3nQNiWdeH2Q/hqdefault.jpg",
      "youtube"
    ),
    duration: 208,
    source: "spotify",
    sourceUrl: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
    streamUrl: "https://www.youtube.com/watch?v=3nQNiWdeH2Q",
    resolvedSource: "youtube",
  },
  {
    id: "sp:7qiZfU4dY1lWllzX7mPBI3",
    title: "Invincible (Original Mix)",
    artist: "DEAF KEV",
    thumbnail: upgradeThumbnail(
      "https://i.ytimg.com/vi/J2X5mJ3HDYE/hqdefault.jpg",
      "youtube"
    ),
    duration: 273,
    source: "spotify",
    sourceUrl: "https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3",
    streamUrl: "https://www.youtube.com/watch?v=J2X5mJ3HDYE",
    resolvedSource: "youtube",
  },
  {
    id: "yt:K4DyBUG242c",
    title: "On & On (feat. Daniel Levi)",
    artist: "Cartoon, Jéja",
    thumbnail: upgradeThumbnail(
      "https://i.ytimg.com/vi/K4DyBUG242c/hqdefault.jpg",
      "youtube"
    ),
    duration: 208,
    source: "youtube",
    sourceUrl: "https://www.youtube.com/watch?v=K4DyBUG242c",
  },
  {
    id: "yt:jfKfPfyJRdk",
    title: "Lofi Hip Hop Radio — Beats to Relax / Study To",
    artist: "Lofi Girl",
    thumbnail: upgradeThumbnail(
      "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg",
      "youtube"
    ),
    duration: 240,
    source: "youtube",
    sourceUrl: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
  },
  {
    id: "yt:7NOSDKb0HlU",
    title: "Midnight Jazz & Warm Vinyl Crackles",
    artist: "Chillhop Music",
    thumbnail: upgradeThumbnail(
      "https://i.ytimg.com/vi/7NOSDKb0HlU/hqdefault.jpg",
      "youtube"
    ),
    duration: 215,
    source: "youtube",
    sourceUrl: "https://www.youtube.com/watch?v=7NOSDKb0HlU",
  },
  {
    id: "yt:4xDzrJKXOOY",
    title: "Synthwave Radio — Beats to Chill / Game To",
    artist: "Lofi Girl Synthwave",
    thumbnail: upgradeThumbnail(
      "https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg",
      "youtube"
    ),
    duration: 268,
    source: "youtube",
    sourceUrl: "https://www.youtube.com/watch?v=4xDzrJKXOOY",
  },
  {
    id: "sc:forss-flickermood",
    title: "Flickermood",
    artist: "Forss",
    thumbnail: upgradeThumbnail(
      "https://i1.sndcdn.com/artworks-000067273316-smsiqx-large.jpg",
      "soundcloud"
    ),
    duration: 214,
    source: "soundcloud",
    sourceUrl: "https://soundcloud.com/forss/flickermood",
  },
  {
    id: "sc:chillhopdotcom-sleepermane-soothe",
    title: "Soothe (Warm Tape Session)",
    artist: "Sleepermane · Chillhop",
    thumbnail: upgradeThumbnail(
      "https://i.ytimg.com/vi/5yx6BWlEVcY/hqdefault.jpg",
      "youtube"
    ),
    duration: 164,
    source: "soundcloud",
    sourceUrl: "https://soundcloud.com/chillhopdotcom/sleepermane-soothe",
  },
  {
    id: "sc:odesza-say-my-name-feat-zyra",
    title: "A Moment Apart (SoundCloud Showcase)",
    artist: "ODESZA",
    thumbnail: upgradeThumbnail(
      "https://i.ytimg.com/vi/bM7SZ5SBzyY/hqdefault.jpg",
      "youtube"
    ),
    duration: 234,
    source: "soundcloud",
    sourceUrl: "https://soundcloud.com/odesza/a-moment-apart",
  },
];

export const CURATED_PLAYLISTS: CuratedPlaylist[] = [
  {
    id: "pl-audiophile-night",
    name: "Late Night Audiophile",
    subtitle: "Warm vinyl, synthwave & ambient",
    thumbnail: upgradeThumbnail(
      "https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault.jpg",
      "youtube"
    ),
    accentColor: "#FF0000",
    trackIds: ["yt:4xDzrJKXOOY", "yt:7NOSDKb0HlU", "yt:jfKfPfyJRdk"],
  },
  {
    id: "pl-spotify-mapped",
    name: "Spotify Hi-Res Bridge",
    subtitle: "Spotify metadata → full audio",
    thumbnail: upgradeThumbnail(
      "https://i.ytimg.com/vi/TW9d8vYrVFQ/hqdefault.jpg",
      "youtube"
    ),
    accentColor: "#1DB954",
    trackIds: [
      "sp:4cOdK2wGLETKBW3PvgPWqT",
      "sp:0VjIjW4GlUZAMYd2vXMi3b",
      "sp:7qiZfU4dY1lWllzX7mPBI3",
    ],
  },
  {
    id: "pl-soundcloud-digs",
    name: "SoundCloud Underground",
    subtitle: "Indie beats & chillhop cuts",
    thumbnail: upgradeThumbnail(
      "https://i.ytimg.com/vi/5yx6BWlEVcY/hqdefault.jpg",
      "youtube"
    ),
    accentColor: "#FF5500",
    trackIds: [
      "sc:forss-flickermood",
      "sc:chillhopdotcom-sleepermane-soothe",
      "sc:odesza-say-my-name-feat-zyra",
    ],
  },
];

export const SAMPLE_LYRICS: Record<string, string[]> = {
  "sp:0VjIjW4GlUZAMYd2vXMi3b": [
    "I'm walking alone, the streets are empty",
    "The only thing I can see is my own silhouette",
    "I'm getting stronger, step by step",
    "The clock is ticking but there's no time for regrets",
    "I've been flying from town to town",
    "From London to Taiwan",
    "I've been all around the globe",
    "Trying to protect your soul",
    "We are heroes tonight",
    "We will fly above the sky",
    "We are heroes tonight, yeah",
  ],
  "yt:K4DyBUG242c": [
    "Hold me close 'til I get up",
    "Time is barely on our side",
    "I don't wanna waste what's left",
    "The storms we chase are leading us",
    "And love is all we'll ever trust, yeah",
    "No, I don't wanna waste what's left",
    "And on and on we'll go",
    "Through the wastelands, through the highways",
    "'Til my shadow turns to sun rays",
  ],
};

export function searchFallbackCatalog(
  query: string,
  sourceFilter?: "all" | "youtube" | "soundcloud" | "spotify"
): UnifiedTrack[] {
  const q = query.trim().toLowerCase();
  return FALLBACK_CATALOG.filter((track) => {
    if (sourceFilter && sourceFilter !== "all" && track.source !== sourceFilter) {
      return false;
    }
    if (!q) return true;
    return (
      track.title.toLowerCase().includes(q) ||
      track.artist.toLowerCase().includes(q) ||
      track.source.toLowerCase().includes(q)
    );
  });
}
