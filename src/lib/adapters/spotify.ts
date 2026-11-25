import type { ResolveResponse, UnifiedTrack } from "@/lib/audio/types";
import { REGIONS, type RegionCode } from "@/lib/audio/region";
import { searchYouTube } from "./youtube";
import { searchSoundCloud } from "./soundcloud";

let cachedToken: { token: string; expiresAt: number } | null = null;

const NOISE_KEYWORDS = [
  "cover",
  "remix",
  "live",
  "reaction",
  "karaoke",
  "nightcore",
  "slowed",
  "8d audio",
  "instrumental",
];

interface SpotifyArtist {
  name: string;
}

interface SpotifyImage {
  url: string;
}

interface SpotifyTrackObject {
  id: string;
  name: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album?: {
    images?: SpotifyImage[];
  };
  external_urls?: {
    spotify?: string;
  };
}

export interface SpotifyByokCredentials {
  clientId?: string;
  clientSecret?: string;
  youtubeApiKey?: string;
}

async function getSpotifyAccessToken(
  override?: SpotifyByokCredentials
): Promise<string | null> {
  const isCustom = Boolean(
    override?.clientId?.trim() && override?.clientSecret?.trim()
  );
  const clientId = isCustom
    ? override!.clientId!.trim()
    : process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = isCustom
    ? override!.clientSecret!.trim()
    : process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (!isCustom && cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };

    if (!isCustom) {
      cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      };
    }
    return data.access_token;
  } catch (error) {
    console.error("[spotify-adapter] token fetch failed:", error);
    return null;
  }
}

function mapSpotifyTrack(
  item: SpotifyTrackObject,
  fallbackThumb = ""
): UnifiedTrack {
  const artists =
    item.artists?.map((a) => a.name).join(", ") || "Unknown Artist";
  const thumbnail = item.album?.images?.[0]?.url || fallbackThumb;

  return {
    id: `sp:${item.id}`,
    title: item.name,
    artist: artists,
    thumbnail,
    duration: Math.round((item.duration_ms || 0) / 1000),
    source: "spotify",
    sourceUrl:
      item.external_urls?.spotify ||
      `https://open.spotify.com/track/${item.id}`,
  };
}

export async function searchSpotify(
  query: string,
  limit = 6,
  credentials?: SpotifyByokCredentials,
  region: RegionCode = "VN"
): Promise<UnifiedTrack[]> {
  if (!query.trim()) return [];
  const token = await getSpotifyAccessToken(credentials);
  if (!token) return [];

  try {
    const url = new URL("https://api.spotify.com/v1/search");
    url.searchParams.set("q", query);
    url.searchParams.set("type", "track");
    url.searchParams.set("market", REGIONS[region].spotifyMarket);
    url.searchParams.set("limit", String(limit));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      tracks?: { items?: SpotifyTrackObject[] };
    };

    return (data.tracks?.items ?? []).map((item) => mapSpotifyTrack(item));
  } catch (error) {
    console.error("[spotify-adapter] searchSpotify failed:", error);
    return [];
  }
}

export async function resolveSpotifyResource(
  resourceType: "track" | "playlist" | "album",
  id: string,
  credentials?: SpotifyByokCredentials
): Promise<ResolveResponse | null> {
  const token = await getSpotifyAccessToken(credentials);

  if (token) {
    try {
      if (resourceType === "track") {
        const res = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 3600 },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as SpotifyTrackObject;
        return {
          type: "track",
          title: data.name,
          tracks: [mapSpotifyTrack(data)],
        };
      }

      if (resourceType === "playlist") {
        const res = await fetch(
          `https://api.spotify.com/v1/playlists/${id}?fields=name,tracks.items(track(id,name,duration_ms,artists(name),album(images),external_urls))`,
          {
            headers: { Authorization: `Bearer ${token}` },
            next: { revalidate: 1800 },
          }
        );
        if (!res.ok) return null;
        const data = (await res.json()) as {
          name?: string;
          tracks?: { items?: Array<{ track?: SpotifyTrackObject | null }> };
        };
        const tracks = (data.tracks?.items ?? [])
          .map((entry) => entry.track)
          .filter((t): t is SpotifyTrackObject => Boolean(t?.id))
          .map((t) => mapSpotifyTrack(t));

        return {
          type: "playlist",
          title: data.name || "Spotify Playlist",
          tracks,
        };
      }

      if (resourceType === "album") {
        const res = await fetch(`https://api.spotify.com/v1/albums/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 3600 },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          name?: string;
          images?: SpotifyImage[];
          tracks?: { items?: SpotifyTrackObject[] };
        };
        const cover = data.images?.[0]?.url || "";
        const tracks = (data.tracks?.items ?? []).map((t) =>
          mapSpotifyTrack(t, cover)
        );
        return {
          type: "album",
          title: data.name || "Spotify Album",
          tracks,
        };
      }
    } catch (error) {
      console.error("[spotify-adapter] API resolve failed:", error);
    }
  }

  // Fallback via official Spotify oEmbed when API credentials aren't configured
  try {
    const spotifyUrl = `https://open.spotify.com/${resourceType}/${id}`;
    const res = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      title?: string;
      thumbnail_url?: string;
    };

    const track: UnifiedTrack = {
      id: `sp:${id}`,
      title: data.title || `Spotify ${resourceType}`,
      artist: "Spotify",
      thumbnail: data.thumbnail_url || "",
      duration: 0,
      source: "spotify",
      sourceUrl: spotifyUrl,
    };

    return {
      type: resourceType,
      title: data.title,
      tracks: [track],
    };
  } catch (error) {
    console.error("[spotify-adapter] oEmbed resolve failed:", error);
    return null;
  }
}

/**
 * Lazy Stream Matching per spotify-matcher skill:
 * - Query: "[Artist] - [Title] Official Audio"
 * - Prefer candidates with duration delta < 5s
 * - Filter out noise keywords (cover, remix, live, reaction...) unless present in original title
 */
export async function matchSpotifyTrackToAudio(
  track: UnifiedTrack,
  credentials?: SpotifyByokCredentials
): Promise<UnifiedTrack> {
  if (track.streamUrl && track.resolvedSource) {
    return track;
  }

  const query = `${track.artist} - ${track.title} Official Audio`.trim();
  const originalTitleLower = track.title.toLowerCase();

  try {
    const ytCandidates = await searchYouTube(
      query,
      8,
      credentials?.youtubeApiKey
    );

    const filtered = ytCandidates.filter((cand) => {
      const candLower = cand.title.toLowerCase();
      return !NOISE_KEYWORDS.some(
        (kw) => candLower.includes(kw) && !originalTitleLower.includes(kw)
      );
    });

    const pool = filtered.length > 0 ? filtered : ytCandidates;

    if (pool.length > 0) {
      const scored = [...pool].sort((a, b) => {
        const diffA =
          track.duration > 0 && a.duration > 0
            ? Math.abs(a.duration - track.duration)
            : 999;
        const diffB =
          track.duration > 0 && b.duration > 0
            ? Math.abs(b.duration - track.duration)
            : 999;

        const aWithin5s = diffA < 5 ? 0 : 1;
        const bWithin5s = diffB < 5 ? 0 : 1;
        if (aWithin5s !== bWithin5s) return aWithin5s - bWithin5s;
        return diffA - diffB;
      });

      const best = scored[0];
      return {
        ...track,
        duration: track.duration || best.duration,
        thumbnail: track.thumbnail || best.thumbnail,
        streamUrl: best.sourceUrl,
        resolvedSource: "youtube",
      };
    }

    // Secondary fallback: SoundCloud
    const scCandidates = await searchSoundCloud(`${track.artist} ${track.title}`);
    if (scCandidates.length > 0) {
      return {
        ...track,
        streamUrl: scCandidates[0].sourceUrl,
        resolvedSource: "soundcloud",
      };
    }
  } catch (error) {
    console.error("[spotify-matcher] matchSpotifyTrackToAudio failed:", error);
  }

  return track;
}
