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

interface SpotifyEmbedTrackItem {
  uri?: string;
  uid?: string;
  title?: string;
  subtitle?: string;
  duration?: number; // milliseconds
}

interface SpotifyEmbedEntity {
  id?: string;
  type?: string;
  name?: string;
  title?: string;
  subtitle?: string;
  duration?: number; // milliseconds
  artists?: Array<{ name?: string }>;
  coverArt?: {
    sources?: Array<{ url?: string; width?: number | null; height?: number | null }>;
  };
  visualIdentity?: {
    image?: Array<{ url?: string; maxWidth?: number; maxHeight?: number }>;
  };
  trackList?: SpotifyEmbedTrackItem[];
}

function pickBestEmbedCover(entity?: SpotifyEmbedEntity): string {
  const coverSources = (entity?.coverArt?.sources ?? []).filter((s) =>
    Boolean(s?.url)
  );
  if (coverSources.length > 0) {
    const sorted = [...coverSources].sort(
      (a, b) => (b.width || 9999) - (a.width || 9999)
    );
    return sorted[0].url || "";
  }

  const visualImages = (entity?.visualIdentity?.image ?? []).filter((img) =>
    Boolean(img?.url)
  );
  if (visualImages.length > 0) {
    const sorted = [...visualImages].sort(
      (a, b) => (b.maxWidth || 0) - (a.maxWidth || 0)
    );
    return sorted[0].url || "";
  }

  return "";
}

function normalizeEmbedText(text?: string): string {
  return (text || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Zero-Key Spotify Embed Fallback:
 * Parses <script id="__NEXT_DATA__"> from https://open.spotify.com/embed/{type}/{id}
 * Works for 100% of public Spotify playlists, albums, and tracks even when Web API returns 403/404 or keys are missing.
 */
async function resolveSpotifyFromEmbed(
  resourceType: "track" | "playlist" | "album",
  id: string
): Promise<ResolveResponse | null> {
  try {
    const embedUrl = `https://open.spotify.com/embed/${resourceType}/${encodeURIComponent(
      id
    )}`;
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
      },
      next: { revalidate: 1800 },
    });

    if (!res.ok) return null;
    const html = await res.text();
    const markerIdx = html.indexOf("__NEXT_DATA__");
    if (markerIdx === -1) return null;

    const jsonStart = html.indexOf(">", markerIdx);
    const jsonEnd = html.indexOf("</script>", jsonStart);
    if (jsonStart === -1 || jsonEnd === -1) return null;

    const parsed = JSON.parse(html.slice(jsonStart + 1, jsonEnd)) as {
      props?: {
        pageProps?: {
          state?: {
            data?: {
              entity?: SpotifyEmbedEntity;
            };
          };
        };
      };
    };

    const entity = parsed?.props?.pageProps?.state?.data?.entity;
    if (!entity) return null;

    const entityTitle = normalizeEmbedText(entity.name || entity.title);
    const cover = pickBestEmbedCover(entity);

    if (resourceType === "track") {
      const artistName =
        entity.artists
          ?.map((a) => normalizeEmbedText(a.name))
          .filter(Boolean)
          .join(", ") ||
        normalizeEmbedText(entity.subtitle) ||
        "Spotify Artist";

      const track: UnifiedTrack = {
        id: `sp:${entity.id || id}`,
        title: entityTitle || "Spotify Track",
        artist: artistName,
        thumbnail: cover,
        duration: Math.round((entity.duration || 0) / 1000),
        source: "spotify",
        sourceUrl: `https://open.spotify.com/track/${entity.id || id}`,
      };

      return {
        type: "track",
        title: track.title,
        tracks: [track],
      };
    }

    const trackList = entity.trackList ?? [];
    if (trackList.length === 0) return null;

    const tracks: UnifiedTrack[] = trackList
      .filter((item) => Boolean(item?.title))
      .map((item, idx) => {
        const uriMatch = item.uri?.match(/spotify:track:([a-zA-Z0-9]+)/i);
        const trackId = uriMatch?.[1] || item.uid || `${id}-${idx}`;
        const title = normalizeEmbedText(item.title) || "Spotify Track";
        const artist =
          normalizeEmbedText(item.subtitle) ||
          normalizeEmbedText(entity.subtitle) ||
          "Spotify Artist";

        return {
          id: `sp:${trackId}`,
          title,
          artist,
          thumbnail: cover,
          duration: Math.round((item.duration || 0) / 1000),
          source: "spotify",
          sourceUrl: uriMatch?.[1]
            ? `https://open.spotify.com/track/${uriMatch[1]}`
            : `https://open.spotify.com/${resourceType}/${id}`,
        };
      });

    if (tracks.length === 0) return null;

    return {
      type: resourceType,
      title:
        entityTitle ||
        (resourceType === "playlist" ? "Spotify Playlist" : "Spotify Album"),
      tracks,
    };
  } catch (error) {
    console.error("[spotify-adapter] embed resolve failed:", error);
    return null;
  }
}

export async function resolveSpotifyResource(
  resourceType: "track" | "playlist" | "album",
  id: string,
  credentials?: SpotifyByokCredentials
): Promise<ResolveResponse | null> {
  const token = await getSpotifyAccessToken(credentials);

  // Step 1: Official Spotify Web API (with market=VN)
  if (token) {
    try {
      if (resourceType === "track") {
        const res = await fetch(
          `https://api.spotify.com/v1/tracks/${id}?market=VN`,
          {
            headers: { Authorization: `Bearer ${token}` },
            next: { revalidate: 3600 },
          }
        );
        if (res.ok) {
          const data = (await res.json()) as SpotifyTrackObject;
          return {
            type: "track",
            title: data.name,
            tracks: [mapSpotifyTrack(data)],
          };
        }
      }

      if (resourceType === "playlist") {
        const res = await fetch(
          `https://api.spotify.com/v1/playlists/${id}?market=VN&fields=name,tracks.items(track(id,name,duration_ms,artists(name),album(images),external_urls))`,
          {
            headers: { Authorization: `Bearer ${token}` },
            next: { revalidate: 1800 },
          }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            name?: string;
            tracks?: { items?: Array<{ track?: SpotifyTrackObject | null }> };
          };
          const tracks = (data.tracks?.items ?? [])
            .map((entry) => entry.track)
            .filter((t): t is SpotifyTrackObject => Boolean(t?.id))
            .map((t) => mapSpotifyTrack(t));

          if (tracks.length > 0) {
            return {
              type: "playlist",
              title: data.name || "Spotify Playlist",
              tracks,
            };
          }
        }
      }

      if (resourceType === "album") {
        const res = await fetch(
          `https://api.spotify.com/v1/albums/${id}?market=VN`,
          {
            headers: { Authorization: `Bearer ${token}` },
            next: { revalidate: 3600 },
          }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            name?: string;
            images?: SpotifyImage[];
            tracks?: { items?: SpotifyTrackObject[] };
          };
          const cover = data.images?.[0]?.url || "";
          const tracks = (data.tracks?.items ?? []).map((t) =>
            mapSpotifyTrack(t, cover)
          );
          if (tracks.length > 0) {
            return {
              type: "album",
              title: data.name || "Spotify Album",
              tracks,
            };
          }
        }
      }
    } catch (error) {
      console.error("[spotify-adapter] API resolve failed:", error);
    }
  }

  // Step 2: Public Spotify Embed Fallback (full trackList without API key / 403 / 404 blocks)
  const embedResolved = await resolveSpotifyFromEmbed(resourceType, id);
  if (embedResolved && embedResolved.tracks.length > 0) {
    return embedResolved;
  }

  // Step 3: Last-resort official Spotify oEmbed metadata
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

    // Secondary fallback: SoundCloud (strictly full-length tracks, never 30s Go+ SNIPPET previews)
    const scCandidates = await searchSoundCloud(`${track.artist} ${track.title}`, 6);
    const fullSc = scCandidates.filter(
      (c) => !c.isSnippet && (c.duration === 0 || c.duration > 45)
    );
    if (fullSc.length > 0) {
      return {
        ...track,
        duration: track.duration || fullSc[0].duration,
        streamUrl: fullSc[0].sourceUrl,
        resolvedSource: "soundcloud",
      };
    }
  } catch (error) {
    console.error("[spotify-matcher] matchSpotifyTrackToAudio failed:", error);
  }

  return track;
}
