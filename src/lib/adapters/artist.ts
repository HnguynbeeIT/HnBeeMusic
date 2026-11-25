import type { TrackSource, UnifiedTrack } from "@/lib/audio/types";
import { upgradeThumbnail } from "@/lib/audio/normalize";
import {
  searchYouTube,
} from "@/lib/adapters/youtube";
import {
  getSoundCloudClientId,
  searchSoundCloud,
} from "@/lib/adapters/soundcloud";
import { FALLBACK_CATALOG } from "@/lib/adapters/fallback-catalog";

export interface ArtistAlbum {
  id: string;
  title: string;
  thumbnail: string;
  releaseYear?: string;
  totalTracks?: number;
  source: TrackSource;
  sourceUrl: string;
  type: "album" | "single" | "playlist";
}

export interface ArtistProfile {
  id: string;
  name: string;
  avatar: string;
  banner?: string;
  genres: string[];
  followers?: number;
  popularity?: number;
  verified: boolean;
  primarySource: TrackSource;
  sourcesFound: TrackSource[];
  externalUrls: Partial<Record<TrackSource, string>>;
}

export interface UnifiedArtistResponse {
  profile: ArtistProfile;
  tracks: UnifiedTrack[];
  albums: ArtistAlbum[];
}

export interface ArtistByokCredentials {
  youtubeApiKey?: string;
  spotifyClientId?: string;
  spotifyClientSecret?: string;
  soundcloudClientId?: string;
}

interface SpotifyArtistObj {
  id: string;
  name: string;
  genres?: string[];
  followers?: { total?: number };
  popularity?: number;
  images?: Array<{ url: string }>;
  external_urls?: { spotify?: string };
}

interface SpotifyTrackObj {
  id: string;
  name: string;
  duration_ms: number;
  artists: Array<{ name: string }>;
  album?: { images?: Array<{ url: string }> };
  external_urls?: { spotify?: string };
}

interface SpotifyAlbumObj {
  id: string;
  name: string;
  album_type?: string;
  release_date?: string;
  total_tracks?: number;
  images?: Array<{ url: string }>;
  external_urls?: { spotify?: string };
}

interface SoundCloudUserObj {
  id: number;
  username: string;
  full_name?: string;
  avatar_url?: string;
  followers_count?: number;
  verified?: boolean;
  permalink_url: string;
  visuals?: {
    visuals?: Array<{ visual_url?: string }>;
  };
}

interface SoundCloudTrackObj {
  id: number;
  title: string;
  permalink_url: string;
  artwork_url?: string | null;
  duration?: number;
  user?: { username?: string; avatar_url?: string };
}

interface SoundCloudPlaylistObj {
  id: number;
  title: string;
  permalink_url: string;
  artwork_url?: string | null;
  track_count?: number;
  created_at?: string;
  tracks?: Array<{ artwork_url?: string | null }>;
}

function normalizeName(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Strict artist name normalizer:
 * Strips platform suffixes (Official, Music, VEVO, Channel, - Topic),
 * lowercases, and collapses whitespace — preserving hyphens/letters so
 * "Guyn" NEVER matches "Guy", "Guy-N", or "GUYGEEGEE".
 */
function normalizeArtistStrict(raw: string): string {
  return raw
    .trim()
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .replace(/\b(official|music|channel)\b/gi, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTrackTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\([^)]*(?:official|audio|video|mv|lyric|feat\.|ft\.|prod\.)[^)]*\)/gi, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function getSpotifyToken(
  creds?: ArtistByokCredentials
): Promise<string | null> {
  const clientId =
    creds?.spotifyClientId?.trim() || process.env.SPOTIFY_CLIENT_ID;
  const clientSecret =
    creds?.spotifyClientSecret?.trim() || process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

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
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

async function fetchSpotifyArtistData(
  name: string,
  artistId?: string,
  creds?: ArtistByokCredentials
): Promise<{
  artist: SpotifyArtistObj | null;
  tracks: UnifiedTrack[];
  albums: ArtistAlbum[];
}> {
  const token = await getSpotifyToken(creds);
  if (!token) return { artist: null, tracks: [], albums: [] };

  try {
    let artist: SpotifyArtistObj | null = null;

    if (artistId && /^[a-zA-Z0-9]{22}$/.test(artistId)) {
      const res = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 1800 },
      });
      if (res.ok) artist = (await res.json()) as SpotifyArtistObj;
    }

    if (!artist && name.trim()) {
      const cleanedQuery = normalizeArtistStrict(name) || name.trim();
      const searchUrl = new URL("https://api.spotify.com/v1/search");
      searchUrl.searchParams.set("q", cleanedQuery);
      searchUrl.searchParams.set("type", "artist");
      searchUrl.searchParams.set("limit", "10");

      const res = await fetch(searchUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 1800 },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          artists?: { items?: SpotifyArtistObj[] };
        };
        const items = data.artists?.items ?? [];

        // STRICT 100% MATCH ONLY: never accept fuzzy/partial lookalikes like "Guy" for "Guyn"
        const exactMatches = items.filter(
          (a) => normalizeArtistStrict(a.name) === cleanedQuery
        );

        const sorted = exactMatches.sort((a, b) => {
          const aHasImg = (a.images?.length ?? 0) > 0 ? 1 : 0;
          const bHasImg = (b.images?.length ?? 0) > 0 ? 1 : 0;
          if (aHasImg !== bHasImg) return bHasImg - aHasImg;
          return (b.followers?.total ?? 0) - (a.followers?.total ?? 0);
        });
        artist = sorted[0] || null;
      }
    }

    if (!artist) return { artist: null, tracks: [], albums: [] };

    const [topRes, albumsRes] = await Promise.all([
      fetch(
        `https://api.spotify.com/v1/artists/${artist.id}/top-tracks?market=VN`,
        {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 1800 },
        }
      ),
      fetch(
        `https://api.spotify.com/v1/artists/${artist.id}/albums?include_groups=album,single&market=VN&limit=8`,
        {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 1800 },
        }
      ),
    ]);

    const tracks: UnifiedTrack[] = [];
    if (topRes.ok) {
      const topData = (await topRes.json()) as { tracks?: SpotifyTrackObj[] };
      for (const item of topData.tracks ?? []) {
        tracks.push({
          id: `sp:${item.id}`,
          title: item.name,
          artist:
            item.artists?.map((a) => a.name).join(", ") || artist.name,
          thumbnail: item.album?.images?.[0]?.url || artist.images?.[0]?.url || "",
          duration: Math.round((item.duration_ms || 0) / 1000),
          source: "spotify",
          sourceUrl:
            item.external_urls?.spotify ||
            `https://open.spotify.com/track/${item.id}`,
        });
      }
    }

    const albums: ArtistAlbum[] = [];
    const rawAlbums: SpotifyAlbumObj[] = [];
    const seenAlbumNames = new Set<string>();
    if (albumsRes.ok) {
      const albData = (await albumsRes.json()) as { items?: SpotifyAlbumObj[] };
      for (const alb of albData.items ?? []) {
        const norm = normalizeName(alb.name);
        if (seenAlbumNames.has(norm)) continue;
        seenAlbumNames.add(norm);
        rawAlbums.push(alb);
        albums.push({
          id: `sp-alb:${alb.id}`,
          title: alb.name,
          thumbnail: alb.images?.[0]?.url || "",
          releaseYear: alb.release_date?.slice(0, 4),
          totalTracks: alb.total_tracks,
          source: "spotify",
          sourceUrl:
            alb.external_urls?.spotify ||
            `https://open.spotify.com/album/${alb.id}`,
          type: alb.album_type === "single" ? "single" : "album",
        });
      }
    }

    // Smart Fallback: if Spotify top-tracks returned empty (common for indie artists),
    // automatically pull tracks from the artist's latest 5 albums/singles
    if (tracks.length === 0 && rawAlbums.length > 0) {
      const recentAlbums = rawAlbums.slice(0, 5);
      const albumTrackLists = await Promise.all(
        recentAlbums.map(async (alb) => {
          try {
            const r = await fetch(
              `https://api.spotify.com/v1/albums/${alb.id}/tracks?market=VN&limit=10`,
              {
                headers: { Authorization: `Bearer ${token}` },
                next: { revalidate: 1800 },
              }
            );
            if (!r.ok) return [] as UnifiedTrack[];
            const d = (await r.json()) as { items?: SpotifyTrackObj[] };
            const cover = alb.images?.[0]?.url || artist?.images?.[0]?.url || "";
            return (d.items ?? []).map((item) => ({
              id: `sp:${item.id}`,
              title: item.name,
              artist:
                item.artists?.map((a) => a.name).join(", ") || artist!.name,
              thumbnail: cover,
              duration: Math.round((item.duration_ms || 0) / 1000),
              source: "spotify" as const,
              sourceUrl:
                item.external_urls?.spotify ||
                `https://open.spotify.com/track/${item.id}`,
            }));
          } catch {
            return [] as UnifiedTrack[];
          }
        })
      );
      for (const list of albumTrackLists) {
        tracks.push(...list);
      }
    }

    return { artist, tracks, albums };
  } catch (error) {
    console.error("[artist-adapter] Spotify artist fetch failed:", error);
    return { artist: null, tracks: [], albums: [] };
  }
}

async function fetchSoundCloudArtistData(
  name: string,
  creds?: ArtistByokCredentials
): Promise<{
  user: SoundCloudUserObj | null;
  tracks: UnifiedTrack[];
  albums: ArtistAlbum[];
}> {
  try {
    const clientId = await getSoundCloudClientId(creds?.soundcloudClientId);
    if (!clientId || !name.trim()) {
      return { user: null, tracks: [], albums: [] };
    }

    const searchUrl = new URL("https://api-v2.soundcloud.com/search/users");
    searchUrl.searchParams.set("q", name.trim());
    searchUrl.searchParams.set("client_id", clientId);
    searchUrl.searchParams.set("limit", "6");

    const userRes = await fetch(searchUrl.toString(), {
      next: { revalidate: 1800 },
    });
    if (!userRes.ok) return { user: null, tracks: [], albums: [] };

    const userData = (await userRes.json()) as {
      collection?: SoundCloudUserObj[];
    };
    const users = userData.collection ?? [];
    const targetStrict = normalizeArtistStrict(name);

    // Strict 100% match on SoundCloud username or full_name
    const bestUser =
      users.find(
        (u) =>
          normalizeArtistStrict(u.username) === targetStrict ||
          normalizeArtistStrict(u.full_name || "") === targetStrict
      ) || null;

    if (!bestUser) {
      return { user: null, tracks: [], albums: [] };
    }

    const [tracksRes, playlistsRes] = await Promise.all([
      fetch(
        `https://api-v2.soundcloud.com/users/${bestUser.id}/tracks?client_id=${clientId}&limit=10`,
        { next: { revalidate: 1800 } }
      ),
      fetch(
        `https://api-v2.soundcloud.com/users/${bestUser.id}/playlists_without_albums?client_id=${clientId}&limit=6`,
        { next: { revalidate: 1800 } }
      ),
    ]);

    const tracks: UnifiedTrack[] = [];
    if (tracksRes.ok) {
      const trData = (await tracksRes.json()) as {
        collection?: SoundCloudTrackObj[];
      };
      for (const item of trData.collection ?? []) {
        if (!item.permalink_url) continue;
        tracks.push({
          id: `sc:${item.id}`,
          title: item.title,
          artist: item.user?.username || bestUser.username,
          thumbnail: upgradeThumbnail(
            item.artwork_url || bestUser.avatar_url || "",
            "soundcloud"
          ),
          duration: Math.round((item.duration || 0) / 1000),
          source: "soundcloud",
          sourceUrl: item.permalink_url,
        });
      }
    }

    if (tracks.length === 0) {
      const searched = await searchSoundCloud(
        name,
        6,
        creds?.soundcloudClientId
      );
      tracks.push(...searched);
    }

    const albums: ArtistAlbum[] = [];
    if (playlistsRes.ok) {
      const plData = (await playlistsRes.json()) as {
        collection?: SoundCloudPlaylistObj[];
      };
      for (const pl of plData.collection ?? []) {
        if (!pl.permalink_url) continue;
        const thumb =
          pl.artwork_url ||
          pl.tracks?.find((t) => t.artwork_url)?.artwork_url ||
          bestUser.avatar_url ||
          "";
        albums.push({
          id: `sc-pl:${pl.id}`,
          title: pl.title,
          thumbnail: upgradeThumbnail(thumb, "soundcloud"),
          releaseYear: pl.created_at?.slice(0, 4),
          totalTracks: pl.track_count,
          source: "soundcloud",
          sourceUrl: pl.permalink_url,
          type: "playlist",
        });
      }
    }

    return { user: bestUser, tracks, albums };
  } catch (error) {
    console.error("[artist-adapter] SoundCloud artist fetch failed:", error);
    return { user: null, tracks: [], albums: [] };
  }
}

async function fetchYouTubeArtistData(
  name: string,
  creds?: ArtistByokCredentials
): Promise<{
  channel: {
    id: string;
    title: string;
    avatar: string;
    subscribers?: number;
  } | null;
  tracks: UnifiedTrack[];
}> {
  const apiKey = creds?.youtubeApiKey?.trim() || process.env.YOUTUBE_API_KEY;
  if (!apiKey || !name.trim()) return { channel: null, tracks: [] };

  try {
    const [chSearchRes, tracks] = await Promise.all([
      fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=3&q=${encodeURIComponent(
          name.trim()
        )}&key=${apiKey}`,
        { next: { revalidate: 1800 } }
      ),
      searchYouTube(`${name.trim()} Official Audio`, 8, apiKey),
    ]);

    let channel: {
      id: string;
      title: string;
      avatar: string;
      subscribers?: number;
    } | null = null;

    if (chSearchRes.ok) {
      const chData = (await chSearchRes.json()) as {
        items?: Array<{
          id?: { channelId?: string };
          snippet?: {
            title?: string;
            thumbnails?: { high?: { url: string }; medium?: { url: string } };
          };
        }>;
      };
      const items = chData.items ?? [];
      const rawLower = name.trim().toLowerCase();
      const targetStrict = normalizeArtistStrict(name);

      // Prefer exact channel title match (e.g. "Guyn Official"), then strict normalized match
      const best =
        items.find((c) => c.snippet?.title?.trim().toLowerCase() === rawLower) ||
        items.find(
          (c) =>
            normalizeArtistStrict(c.snippet?.title || "") === targetStrict
        ) ||
        items[0];

      const channelId = best?.id?.channelId;
      if (channelId) {
        const statsRes = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`,
          { next: { revalidate: 1800 } }
        );
        if (statsRes.ok) {
          const statsData = (await statsRes.json()) as {
            items?: Array<{
              id: string;
              snippet?: {
                title?: string;
                thumbnails?: { high?: { url: string } };
              };
              statistics?: { subscriberCount?: string };
            }>;
          };
          const ch = statsData.items?.[0];
          if (ch) {
            channel = {
              id: ch.id,
              title: ch.snippet?.title || name,
              avatar:
                ch.snippet?.thumbnails?.high?.url ||
                best.snippet?.thumbnails?.high?.url ||
                "",
              subscribers: ch.statistics?.subscriberCount
                ? Number(ch.statistics.subscriberCount)
                : undefined,
            };
          }
        }
      }
    }

    return { channel, tracks };
  } catch (error) {
    console.error("[artist-adapter] YouTube artist fetch failed:", error);
    return { channel: null, tracks: [] };
  }
}

export async function fetchUnifiedArtist(params: {
  name: string;
  id?: string;
  source?: "all" | TrackSource;
  preferredSource?: TrackSource;
  credentials?: ArtistByokCredentials;
}): Promise<UnifiedArtistResponse> {
  const queryName = params.name.trim();
  const sourceFilter = params.source ?? "all";
  const preferredSource = params.preferredSource;

  const wantSp = sourceFilter === "all" || sourceFilter === "spotify";
  const wantSc = sourceFilter === "all" || sourceFilter === "soundcloud";
  const wantYt = sourceFilter === "all" || sourceFilter === "youtube";

  const [spData, scData, ytData] = await Promise.all([
    wantSp
      ? fetchSpotifyArtistData(queryName, params.id, params.credentials)
      : Promise.resolve({ artist: null, tracks: [], albums: [] }),
    wantSc
      ? fetchSoundCloudArtistData(queryName, params.credentials)
      : Promise.resolve({ user: null, tracks: [], albums: [] }),
    wantYt
      ? fetchYouTubeArtistData(queryName, params.credentials)
      : Promise.resolve({ channel: null, tracks: [] }),
  ]);

  const sourcesFound: TrackSource[] = [];
  if (spData.artist || spData.tracks.length > 0) sourcesFound.push("spotify");
  if (ytData.channel || ytData.tracks.length > 0) sourcesFound.push("youtube");
  if (scData.user || scData.tracks.length > 0) sourcesFound.push("soundcloud");

  // Determine primary profile source honoring preferredSource (e.g. ?source=youtube)
  // and falling back cleanly when Spotify has no 100% exact match
  const scAvatar =
    scData.user?.avatar_url && !scData.user.avatar_url.includes("default_avatar")
      ? upgradeThumbnail(scData.user.avatar_url, "soundcloud")
      : "";
  const spAvatar = spData.artist?.images?.[0]?.url || "";
  const ytAvatar = ytData.channel?.avatar || "";

  let primarySource: TrackSource = "youtube";
  if (preferredSource === "youtube" && ytData.channel) {
    primarySource = "youtube";
  } else if (preferredSource === "soundcloud" && scData.user) {
    primarySource = "soundcloud";
  } else if (spData.artist) {
    primarySource = "spotify";
  } else if (ytData.channel) {
    primarySource = "youtube";
  } else if (scData.user) {
    primarySource = "soundcloud";
  } else if (preferredSource) {
    primarySource = preferredSource;
  }

  const avatar =
    (primarySource === "youtube" ? ytAvatar : "") ||
    (primarySource === "soundcloud" ? scAvatar : "") ||
    (primarySource === "spotify" ? spAvatar : "") ||
    ytAvatar ||
    scAvatar ||
    spAvatar ||
    spData.tracks[0]?.thumbnail ||
    ytData.tracks[0]?.thumbnail ||
    scData.tracks[0]?.thumbnail ||
    "";

  const banner =
    scData.user?.visuals?.visuals?.[0]?.visual_url ||
    avatar;

  const externalUrls: Partial<Record<TrackSource, string>> = {};
  if (spData.artist?.external_urls?.spotify) {
    externalUrls.spotify = spData.artist.external_urls.spotify;
  }
  if (ytData.channel?.id) {
    externalUrls.youtube = `https://www.youtube.com/channel/${ytData.channel.id}`;
  }
  if (scData.user?.permalink_url) {
    externalUrls.soundcloud = scData.user.permalink_url;
  }

  // Always preserve exact artist display name clicked by the user (e.g. "Guyn Official" / "Guyn")
  const displayName = queryName || spData.artist?.name || ytData.channel?.title || scData.user?.username || "Artist";

  const profile: ArtistProfile = {
    id:
      (primarySource === "youtube" && ytData.channel ? `yt:${ytData.channel.id}` : "") ||
      (primarySource === "spotify" && spData.artist ? `sp:${spData.artist.id}` : "") ||
      (primarySource === "soundcloud" && scData.user ? `sc:${scData.user.id}` : "") ||
      `artist:${normalizeName(queryName)}`,
    name: displayName,
    avatar,
    banner,
    genres: spData.artist?.genres?.slice(0, 4) ?? [],
    followers:
      (primarySource === "youtube" ? ytData.channel?.subscribers : undefined) ??
      (primarySource === "spotify" ? spData.artist?.followers?.total : undefined) ??
      (primarySource === "soundcloud" ? scData.user?.followers_count : undefined) ??
      spData.artist?.followers?.total ??
      ytData.channel?.subscribers ??
      scData.user?.followers_count,
    popularity: spData.artist?.popularity,
    verified: Boolean(
      (spData.artist && (spData.artist.followers?.total ?? 0) > 1000) ||
        scData.user?.verified ||
        (ytData.channel?.subscribers ?? 0) > 10000
    ),
    primarySource,
    sourcesFound,
    externalUrls,
  };

  // Deduplicate tracks per (source + normalizedTitle) so each platform tab stays rich
  const rawCombined = [...spData.tracks, ...ytData.tracks, ...scData.tracks];
  const seenPerSource = new Set<string>();
  const tracks: UnifiedTrack[] = [];

  for (const t of rawCombined) {
    const key = `${t.source}:${normalizeTrackTitle(t.title)}`;
    if (seenPerSource.has(key)) continue;
    seenPerSource.add(key);
    tracks.push(t);
  }

  // Fallback catalog check if no API keys / offline
  if (tracks.length === 0) {
    const target = normalizeName(queryName);
    const fallbackMatches = FALLBACK_CATALOG.filter((t) =>
      normalizeName(t.artist).includes(target)
    );
    tracks.push(...fallbackMatches);
  }

  const albums = [...spData.albums, ...scData.albums];

  return { profile, tracks, albums };
}
