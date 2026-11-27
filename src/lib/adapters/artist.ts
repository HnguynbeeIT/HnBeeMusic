import type { TrackSource, UnifiedTrack } from "@/lib/audio/types";
import { parseISO8601Duration, upgradeThumbnail } from "@/lib/audio/normalize";
import {
  deduplicateArtistTracks,
  isTrackByArtist,
} from "@/lib/audio/artist-matcher";
import type { ArtistRegion } from "@/lib/audio/region";
import { classifyArtistRegion } from "@/lib/region-classifier";
import { searchYouTube } from "@/lib/adapters/youtube";
import { getSoundCloudClientId } from "@/lib/adapters/soundcloud";
import { FALLBACK_CATALOG } from "@/lib/adapters/fallback-catalog";
import { findVerifiedArtist } from "@/config/verified-artists";
import {
  appleMusicProviderAdapter,
  audiusProviderAdapter,
  nhacCuaTuiProviderAdapter,
  zingMp3ProviderAdapter,
} from "@/lib/adapters/extended-providers";

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
  aliases?: string[];
  avatar: string;
  banner?: string;
  bio?: string;
  region: ArtistRegion;
  language: string;
  genres: string[];
  followers?: number;
  popularity?: number;
  verified: boolean;
  primarySource: TrackSource;
  sourcesFound: TrackSource[];
  externalUrls: Partial<Record<TrackSource, string>>;
  wikiUrl?: {
    label: string;
    url: string;
  };
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

function normalizeArtistStrict(raw: string): string {
  return raw
    .trim()
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .replace(/\b(official|offical|music|channel)\b/gi, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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
  creds?: ArtistByokCredentials,
  lockedPermalink?: string
): Promise<{
  user: SoundCloudUserObj | null;
  tracks: UnifiedTrack[];
  albums: ArtistAlbum[];
}> {
  try {
    const clientId = await getSoundCloudClientId(creds?.soundcloudClientId);
    if (!clientId || (!name.trim() && !lockedPermalink)) {
      return { user: null, tracks: [], albums: [] };
    }

    let bestUser: SoundCloudUserObj | null = null;

    // 1. Direct permalink resolve for Verified Artists (e.g. soundcloud.com/guyn-music)
    if (lockedPermalink) {
      const resolveUrl = new URL("https://api-v2.soundcloud.com/resolve");
      resolveUrl.searchParams.set(
        "url",
        `https://soundcloud.com/${lockedPermalink}`
      );
      resolveUrl.searchParams.set("client_id", clientId);

      const res = await fetch(resolveUrl.toString(), {
        next: { revalidate: 1800 },
      });
      if (res.ok) {
        bestUser = (await res.json()) as SoundCloudUserObj;
      }
    }

    // 2. Fallback: strict 100% name match via SoundCloud search/users
    if (!bestUser && name.trim()) {
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

      bestUser =
        users.find(
          (u) =>
            normalizeArtistStrict(u.username) === targetStrict ||
            normalizeArtistStrict(u.full_name || "") === targetStrict
        ) || null;
    }

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
      return { user: bestUser, tracks: [], albums: [] };
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
  creds?: ArtistByokCredentials,
  lockedHandle?: string
): Promise<{
  channel: {
    id: string;
    title: string;
    avatar: string;
    country?: string;
    subscribers?: number;
  } | null;
  tracks: UnifiedTrack[];
}> {
  const apiKey = creds?.youtubeApiKey?.trim() || process.env.YOUTUBE_API_KEY;
  if (!apiKey || (!name.trim() && !lockedHandle)) {
    return { channel: null, tracks: [] };
  }

  try {
    let channel: {
      id: string;
      title: string;
      avatar: string;
      country?: string;
      subscribers?: number;
    } | null = null;

    // 1. Direct handle lookup for Verified Artists (e.g. forHandle=@HnBeeStudio)
    if (lockedHandle) {
      const handleRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&forHandle=${encodeURIComponent(
          lockedHandle
        )}&key=${apiKey}`,
        { next: { revalidate: 1800 } }
      );
      if (handleRes.ok) {
        const handleData = (await handleRes.json()) as {
          items?: Array<{
            id: string;
            snippet?: {
              title?: string;
              country?: string;
              thumbnails?: { high?: { url: string } };
            };
            statistics?: { subscriberCount?: string };
          }>;
        };
        const ch = handleData.items?.[0];
        if (ch) {
          channel = {
            id: ch.id,
            title: ch.snippet?.title || name,
            avatar: ch.snippet?.thumbnails?.high?.url || "",
            country: ch.snippet?.country,
            subscribers: ch.statistics?.subscriberCount
              ? Number(ch.statistics.subscriberCount)
              : undefined,
          };
        }
      }
    }

    // 2. If locked channel found, fetch its exact popular uploads directly
    if (channel?.id && lockedHandle) {
      const chVideosRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channel.id}&type=video&order=viewCount&maxResults=10&key=${apiKey}`,
        { next: { revalidate: 1800 } }
      );
      if (chVideosRes.ok) {
        const vidData = (await chVideosRes.json()) as {
          items?: Array<{
            id?: { videoId?: string };
            snippet?: {
              title?: string;
              channelTitle?: string;
              thumbnails?: {
                high?: { url: string };
                medium?: { url: string };
              };
            };
          }>;
        };
        const items = (vidData.items ?? []).filter((i) => i.id?.videoId);
        const ids = items.map((i) => i.id!.videoId!).join(",");
        const durationMap = new Map<string, number>();

        if (ids) {
          const detRes = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${apiKey}`,
            { next: { revalidate: 1800 } }
          );
          if (detRes.ok) {
            const detData = (await detRes.json()) as {
              items?: Array<{
                id: string;
                contentDetails?: { duration?: string };
              }>;
            };
            for (const v of detData.items ?? []) {
              durationMap.set(
                v.id,
                parseISO8601Duration(v.contentDetails?.duration)
              );
            }
          }
        }

        const tracks: UnifiedTrack[] = items.map((item) => {
          const videoId = item.id!.videoId!;
          const rawThumb =
            item.snippet?.thumbnails?.high?.url ||
            item.snippet?.thumbnails?.medium?.url ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          return {
            id: `yt:${videoId}`,
            title: (item.snippet?.title || "YouTube Track")
              .replace(/&amp;/g, "&")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'"),
            artist: item.snippet?.channelTitle || channel!.title || name,
            thumbnail: upgradeThumbnail(rawThumb, "youtube"),
            duration: durationMap.get(videoId) ?? 0,
            source: "youtube",
            sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
          };
        });

        if (tracks.length > 0) {
          return { channel, tracks };
        }
      }
    }

    const [chSearchRes, tracks] = await Promise.all([
      !channel
        ? fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=3&q=${encodeURIComponent(
              name.trim()
            )}&key=${apiKey}`,
            { next: { revalidate: 1800 } }
          )
        : Promise.resolve(null),
      searchYouTube(`${name.trim()} Official Audio`, 8, apiKey),
    ]);

    if (chSearchRes && chSearchRes.ok) {
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

      const best =
        items.find((c) => c.snippet?.title?.trim().toLowerCase() === rawLower) ||
        items.find(
          (c) =>
            normalizeArtistStrict(c.snippet?.title || "") === targetStrict
        ) ||
        null;

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
                country?: string;
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
              country: ch.snippet?.country,
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

function buildArtistMatchAliases(
  effectiveName: string,
  candidates: Array<string | undefined | null>
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of [effectiveName, ...candidates]) {
    const cleaned = (raw || "").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function filterTracksStrictlyByArtist(
  artistName: string,
  aliases: readonly string[],
  tracks: readonly UnifiedTrack[]
): UnifiedTrack[] {
  return tracks.filter((track) => isTrackByArtist(track, artistName, aliases));
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

  const verifiedArtist = findVerifiedArtist(queryName, params.id);
  const effectiveName = verifiedArtist?.displayName || queryName;
  const effectiveSpotifyId =
    verifiedArtist?.platforms.spotify?.id || params.id;
  const lockedYtHandle = verifiedArtist?.platforms.youtube?.handle;
  const lockedScPermalink = verifiedArtist?.platforms.soundcloud?.permalink;

  const wantSp = sourceFilter === "all" || sourceFilter === "spotify";
  const wantSc = sourceFilter === "all" || sourceFilter === "soundcloud";
  const wantYt = sourceFilter === "all" || sourceFilter === "youtube";
  const wantZing = sourceFilter === "all" || sourceFilter === "zingmp3";
  const wantNct = sourceFilter === "all" || sourceFilter === "nhaccuatui";
  const wantApple = sourceFilter === "all" || sourceFilter === "apple_music";
  const wantAudius = sourceFilter === "all" || sourceFilter === "audius";

  const extLimit = sourceFilter === "all" ? 8 : 12;

  const [
    spData,
    scData,
    ytData,
    rawZingTracks,
    rawNctTracks,
    rawAppleTracks,
    rawAudiusTracks,
  ] = await Promise.all([
    wantSp
      ? fetchSpotifyArtistData(
          effectiveName,
          effectiveSpotifyId,
          params.credentials
        )
      : Promise.resolve({ artist: null, tracks: [], albums: [] }),
    wantSc
      ? fetchSoundCloudArtistData(
          effectiveName,
          params.credentials,
          lockedScPermalink
        )
      : Promise.resolve({ user: null, tracks: [], albums: [] }),
    wantYt
      ? fetchYouTubeArtistData(
          effectiveName,
          params.credentials,
          lockedYtHandle
        )
      : Promise.resolve({ channel: null, tracks: [] }),
    wantZing
      ? zingMp3ProviderAdapter.search(effectiveName, extLimit).catch(() => [])
      : Promise.resolve([]),
    wantNct
      ? nhacCuaTuiProviderAdapter
          .search(effectiveName, extLimit)
          .catch(() => [])
      : Promise.resolve([]),
    wantApple
      ? appleMusicProviderAdapter
          .search(effectiveName, extLimit)
          .catch(() => [])
      : Promise.resolve([]),
    wantAudius
      ? audiusProviderAdapter.search(effectiveName, extLimit).catch(() => [])
      : Promise.resolve([]),
  ]);

  const artistAliases = buildArtistMatchAliases(effectiveName, [
    ...(verifiedArtist?.trackAliases ?? []),
    queryName,
    spData.artist?.name,
    ytData.channel?.title,
    scData.user?.username,
  ]);

  const spTracks = filterTracksStrictlyByArtist(
    effectiveName,
    artistAliases,
    spData.tracks
  );
  const scTracks = filterTracksStrictlyByArtist(
    effectiveName,
    artistAliases,
    scData.tracks
  );
  const ytTracks = filterTracksStrictlyByArtist(
    effectiveName,
    artistAliases,
    ytData.tracks
  );
  const zingTracks = filterTracksStrictlyByArtist(
    effectiveName,
    artistAliases,
    rawZingTracks
  );
  const nctTracks = filterTracksStrictlyByArtist(
    effectiveName,
    artistAliases,
    rawNctTracks
  );
  const appleTracks = filterTracksStrictlyByArtist(
    effectiveName,
    artistAliases,
    rawAppleTracks
  );
  const audiusTracks = filterTracksStrictlyByArtist(
    effectiveName,
    artistAliases,
    rawAudiusTracks
  );

  const sourcesFound: TrackSource[] = [];
  if (spData.artist || spTracks.length > 0) sourcesFound.push("spotify");
  if (ytData.channel || ytTracks.length > 0) sourcesFound.push("youtube");
  if (scData.user || scTracks.length > 0) sourcesFound.push("soundcloud");
  if (zingTracks.length > 0) sourcesFound.push("zingmp3");
  if (nctTracks.length > 0) sourcesFound.push("nhaccuatui");
  if (appleTracks.length > 0) sourcesFound.push("apple_music");
  if (audiusTracks.length > 0) sourcesFound.push("audius");

  const scAvatar =
    scData.user?.avatar_url && !scData.user.avatar_url.includes("default_avatar")
      ? upgradeThumbnail(scData.user.avatar_url, "soundcloud")
      : "";
  const spAvatar = spData.artist?.images?.[0]?.url || "";
  const ytAvatar = ytData.channel?.avatar || "";

  let primarySource: TrackSource = "youtube";
  if (spData.artist) {
    primarySource = "spotify";
  } else if (preferredSource === "youtube" && ytData.channel) {
    primarySource = "youtube";
  } else if (preferredSource === "soundcloud" && scData.user) {
    primarySource = "soundcloud";
  } else if (ytData.channel) {
    primarySource = "youtube";
  } else if (scData.user) {
    primarySource = "soundcloud";
  } else if (zingTracks.length > 0) {
    primarySource = "zingmp3";
  } else if (appleTracks.length > 0) {
    primarySource = "apple_music";
  } else if (preferredSource) {
    primarySource = preferredSource;
  }

  const avatar =
    spAvatar ||
    scAvatar ||
    ytAvatar ||
    verifiedArtist?.defaultAvatar ||
    spTracks[0]?.thumbnail ||
    ytTracks[0]?.thumbnail ||
    zingTracks[0]?.thumbnail ||
    appleTracks[0]?.thumbnail ||
    scTracks[0]?.thumbnail ||
    audiusTracks[0]?.thumbnail ||
    "";

  const banner = scData.user?.visuals?.visuals?.[0]?.visual_url || avatar;

  const displayName =
    verifiedArtist?.displayName ||
    (spData.artist && spData.artist.name) ||
    queryName.replace(/\s+\b(official|offical)\b$/i, "").trim() ||
    queryName;

  const encodedArtist = encodeURIComponent(displayName);
  const externalUrls: Partial<Record<TrackSource, string>> = {
    spotify:
      verifiedArtist?.platforms.spotify?.url ||
      spData.artist?.external_urls?.spotify ||
      `https://open.spotify.com/search/${encodedArtist}`,
    youtube:
      verifiedArtist?.platforms.youtube?.url ||
      (ytData.channel?.id
        ? `https://www.youtube.com/channel/${ytData.channel.id}`
        : `https://www.youtube.com/results?search_query=${encodedArtist}`),
    soundcloud:
      verifiedArtist?.platforms.soundcloud?.url ||
      scData.user?.permalink_url ||
      `https://soundcloud.com/search?q=${encodedArtist}`,
    zingmp3: `https://zingmp3.vn/tim-kiem/tat-ca?q=${encodedArtist}`,
    nhaccuatui: `https://www.nhaccuatui.com/tim-kiem?q=${encodedArtist}`,
    apple_music: `https://music.apple.com/vn/search?term=${encodedArtist}`,
    audius: `https://audius.co/search/${encodedArtist}`,
  };

  const finalGenres =
    verifiedArtist?.genres ?? spData.artist?.genres?.slice(0, 4) ?? [];
  const sampleTitles = [
    ...spTracks.map((t) => t.title),
    ...spData.albums.map((a) => a.title),
    ...ytTracks.map((t) => t.title),
    ...scTracks.map((t) => t.title),
    ...zingTracks.map((t) => t.title),
    ...appleTracks.map((t) => t.title),
  ];
  const detectedRegion = classifyArtistRegion({
    name: displayName,
    artistId: spData.artist?.id || params.id,
    genres: finalGenres,
    sampleTitles,
    youtubeCountry: ytData.channel?.country,
  });

  const profile: ArtistProfile = {
    id:
      verifiedArtist?.id ||
      (spData.artist ? `sp:${spData.artist.id}` : "") ||
      (ytData.channel ? `yt:${ytData.channel.id}` : "") ||
      (scData.user ? `sc:${scData.user.id}` : "") ||
      `artist:${normalizeName(queryName)}`,
    name: displayName,
    aliases: artistAliases,
    avatar,
    banner,
    bio: verifiedArtist?.bio,
    region: detectedRegion.region,
    language: detectedRegion.language,
    genres: finalGenres,
    followers:
      spData.artist?.followers?.total ??
      ytData.channel?.subscribers ??
      scData.user?.followers_count,
    popularity: spData.artist?.popularity,
    verified: Boolean(
      verifiedArtist?.verified ||
        (spData.artist &&
          (spData.albums.length > 0 || spTracks.length > 0)) ||
        (spData.artist && ytData.channel) ||
        scData.user?.verified ||
        (ytData.channel?.subscribers ?? 0) > 10000
    ),
    primarySource,
    sourcesFound,
    externalUrls,
    wikiUrl: verifiedArtist?.platforms.wiki,
  };

  const rawCombined = [
    ...spTracks,
    ...zingTracks,
    ...ytTracks,
    ...appleTracks,
    ...nctTracks,
    ...scTracks,
    ...audiusTracks,
  ];
  const tracks = deduplicateArtistTracks(rawCombined, "per-source");

  if (tracks.length === 0) {
    const fallbackMatches = filterTracksStrictlyByArtist(
      displayName,
      artistAliases,
      FALLBACK_CATALOG
    );
    tracks.push(...deduplicateArtistTracks(fallbackMatches, "per-source"));
  }

  const albums = [...spData.albums, ...scData.albums];

  return { profile, tracks, albums };
}
