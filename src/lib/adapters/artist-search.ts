import type { ArtistSearchItem, TrackSource } from "@/lib/audio/types";
import { upgradeThumbnail } from "@/lib/audio/normalize";
import {
  REGIONS,
  detectArtistRegion,
  type RegionCode,
} from "@/lib/audio/region";
import { getSoundCloudClientId } from "@/lib/adapters/soundcloud";
import {
  VERIFIED_ARTISTS,
  findVerifiedArtist,
  type VerifiedArtistConfig,
} from "@/config/verified-artists";

export interface ArtistSearchByok {
  youtubeApiKey?: string;
  spotifyClientId?: string;
  spotifyClientSecret?: string;
  soundcloudClientId?: string;
}

const SPOTIFY_ARTIST_URL_RE =
  /(?:https?:\/\/)?open\.spotify\.com\/(?:intl-[a-z]{2}\/)?artist\/([a-zA-Z0-9]+)/i;
const YOUTUBE_HANDLE_URL_RE =
  /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(@[a-zA-Z0-9._-]+)/i;
const SOUNDCLOUD_PROFILE_URL_RE =
  /(?:https?:\/\/)?(?:www\.|m\.)?soundcloud\.com\/([a-zA-Z0-9_-]+)(?:\/tracks|\/?)?$/i;

function normKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(official|offical|music|channel|vevo)\b/gi, "")
    .replace(/[^a-z0-9]/g, "");
}

function makeArtistHref(
  name: string,
  source: TrackSource,
  artistId?: string
): string {
  const params = new URLSearchParams({ source });
  if (artistId) params.set("artistId", artistId);
  return `/artist/${encodeURIComponent(name)}?${params.toString()}`;
}

function finalizeArtistItem(
  item: Omit<ArtistSearchItem, "avatarUrl" | "href">
): ArtistSearchItem {
  return {
    ...item,
    avatarUrl: item.avatar,
    href: makeArtistHref(item.name, item.source, item.artistId),
  };
}

function verifiedToSearchItem(v: VerifiedArtistConfig): ArtistSearchItem {
  return finalizeArtistItem({
    id: v.id,
    name: v.displayName,
    avatar: v.defaultAvatar,
    source: "spotify",
    artistId: v.platforms.spotify?.id,
    genres: v.genres,
    verified: v.verified,
    region: v.region,
    language: v.language,
    sourceUrl: v.platforms.spotify?.url || v.platforms.youtube?.url,
  });
}

async function getSpotifyToken(creds?: ArtistSearchByok): Promise<string | null> {
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

async function searchSpotifyArtists(
  query: string,
  region: RegionCode,
  creds?: ArtistSearchByok,
  directArtistId?: string
): Promise<ArtistSearchItem[]> {
  const token = await getSpotifyToken(creds);
  if (!token) return [];

  try {
    if (directArtistId) {
      const res = await fetch(
        `https://api.spotify.com/v1/artists/${directArtistId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 1800 },
        }
      );
      if (!res.ok) return [];
      const a = (await res.json()) as {
        id: string;
        name: string;
        images?: Array<{ url: string }>;
        followers?: { total?: number };
        genres?: string[];
        external_urls?: { spotify?: string };
      };
      const verified = findVerifiedArtist(a.name, a.id);
      if (verified) {
        return [
          finalizeArtistItem({
            ...verifiedToSearchItem(verified),
            avatar: a.images?.[0]?.url || verified.defaultAvatar,
            followers: a.followers?.total,
          }),
        ];
      }
      const detected = detectArtistRegion(a.genres ?? [], a.name);
      return [
        finalizeArtistItem({
          id: `sp:${a.id}`,
          name: a.name,
          avatar: a.images?.[0]?.url || "",
          source: "spotify",
          artistId: a.id,
          followers: a.followers?.total,
          genres: (a.genres ?? []).slice(0, 3),
          verified: (a.followers?.total ?? 0) > 1000,
          region: detected.region,
          language: detected.language,
          sourceUrl: a.external_urls?.spotify,
        }),
      ];
    }

    const url = new URL("https://api.spotify.com/v1/search");
    url.searchParams.set("q", query);
    url.searchParams.set("type", "artist");
    url.searchParams.set("market", REGIONS[region].spotifyMarket);
    url.searchParams.set("limit", "6");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      artists?: {
        items?: Array<{
          id: string;
          name: string;
          images?: Array<{ url: string }>;
          followers?: { total?: number };
          genres?: string[];
          external_urls?: { spotify?: string };
        }>;
      };
    };

    return (data.artists?.items ?? []).map((a) => {
      const detected = detectArtistRegion(a.genres ?? [], a.name);
      return finalizeArtistItem({
        id: `sp:${a.id}`,
        name: a.name,
        avatar: a.images?.[0]?.url || "",
        source: "spotify" as const,
        artistId: a.id,
        followers: a.followers?.total,
        genres: (a.genres ?? []).slice(0, 3),
        verified: (a.followers?.total ?? 0) > 1000,
        region: detected.region,
        language: detected.language,
        sourceUrl: a.external_urls?.spotify,
      });
    });
  } catch (error) {
    console.error("[artist-search] Spotify failed:", error);
    return [];
  }
}

async function searchYouTubeChannels(
  query: string,
  region: RegionCode,
  creds?: ArtistSearchByok,
  directHandle?: string
): Promise<ArtistSearchItem[]> {
  const apiKey = creds?.youtubeApiKey?.trim() || process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  try {
    if (directHandle) {
      const verified = findVerifiedArtist(directHandle);
      if (verified) return [verifiedToSearchItem(verified)];

      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&forHandle=${encodeURIComponent(
          directHandle
        )}&key=${apiKey}`,
        { next: { revalidate: 1800 } }
      );
      if (!res.ok) return [];
      const data = (await res.json()) as {
        items?: Array<{
          id: string;
          snippet?: {
            title?: string;
            thumbnails?: { high?: { url: string } };
          };
          statistics?: { subscriberCount?: string };
        }>;
      };
      const ch = data.items?.[0];
      if (!ch) return [];
      const title = ch.snippet?.title || directHandle;
      const detected = detectArtistRegion([], title);
      return [
        finalizeArtistItem({
          id: `yt:${ch.id}`,
          name: title,
          avatar: ch.snippet?.thumbnails?.high?.url || "",
          source: "youtube",
          followers: ch.statistics?.subscriberCount
            ? Number(ch.statistics.subscriberCount)
            : undefined,
          genres: [],
          verified: Number(ch.statistics?.subscriberCount || 0) > 10000,
          region: detected.region,
          language: detected.language,
          sourceUrl: `https://www.youtube.com/channel/${ch.id}`,
        }),
      ];
    }

    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "channel");
    url.searchParams.set("maxResults", "4");
    url.searchParams.set("q", query);
    const regionInfo = REGIONS[region];
    if (regionInfo.youtubeRegion) {
      url.searchParams.set("regionCode", regionInfo.youtubeRegion);
    }
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString(), { next: { revalidate: 1800 } });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      items?: Array<{
        id?: { channelId?: string };
        snippet?: {
          title?: string;
          thumbnails?: { high?: { url: string }; medium?: { url: string } };
        };
      }>;
    };

    return (data.items ?? [])
      .filter((i) => Boolean(i.id?.channelId && i.snippet?.title))
      .map((item) => {
        const title = item.snippet!.title!;
        const detected = detectArtistRegion([], title);
        return finalizeArtistItem({
          id: `yt:${item.id!.channelId!}`,
          name: title,
          avatar:
            item.snippet?.thumbnails?.high?.url ||
            item.snippet?.thumbnails?.medium?.url ||
            "",
          source: "youtube" as const,
          genres: [],
          verified: false,
          region: detected.region,
          language: detected.language,
          sourceUrl: `https://www.youtube.com/channel/${item.id!.channelId!}`,
        });
      });
  } catch (error) {
    console.error("[artist-search] YouTube channels failed:", error);
    return [];
  }
}

async function searchSoundCloudUsers(
  query: string,
  creds?: ArtistSearchByok,
  directPermalink?: string
): Promise<ArtistSearchItem[]> {
  try {
    const clientId = await getSoundCloudClientId(creds?.soundcloudClientId);
    if (!clientId) return [];

    if (directPermalink) {
      const verified = findVerifiedArtist(directPermalink);
      if (verified) return [verifiedToSearchItem(verified)];

      const res = await fetch(
        `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(
          `https://soundcloud.com/${directPermalink}`
        )}&client_id=${clientId}`,
        { next: { revalidate: 1800 } }
      );
      if (!res.ok) return [];
      const u = (await res.json()) as {
        id: number;
        username?: string;
        avatar_url?: string;
        followers_count?: number;
        verified?: boolean;
        permalink_url?: string;
      };
      if (!u.username) return [];
      const detected = detectArtistRegion([], u.username);
      return [
        finalizeArtistItem({
          id: `sc:${u.id}`,
          name: u.username,
          avatar: u.avatar_url
            ? upgradeThumbnail(u.avatar_url, "soundcloud")
            : "",
          source: "soundcloud",
          followers: u.followers_count,
          genres: [],
          verified: Boolean(u.verified),
          region: detected.region,
          language: detected.language,
          sourceUrl: u.permalink_url,
        }),
      ];
    }

    const url = new URL("https://api-v2.soundcloud.com/search/users");
    url.searchParams.set("q", query);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("limit", "4");

    const res = await fetch(url.toString(), { next: { revalidate: 1800 } });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      collection?: Array<{
        id: number;
        username?: string;
        avatar_url?: string;
        followers_count?: number;
        verified?: boolean;
        permalink_url?: string;
      }>;
    };

    return (data.collection ?? [])
      .filter((u) => Boolean(u.username))
      .map((u) => {
        const detected = detectArtistRegion([], u.username!);
        return finalizeArtistItem({
          id: `sc:${u.id}`,
          name: u.username!,
          avatar:
            u.avatar_url && !u.avatar_url.includes("default_avatar")
              ? upgradeThumbnail(u.avatar_url, "soundcloud")
              : "",
          source: "soundcloud" as const,
          followers: u.followers_count,
          genres: [],
          verified: Boolean(u.verified),
          region: detected.region,
          language: detected.language,
          sourceUrl: u.permalink_url,
        });
      });
  } catch (error) {
    console.error("[artist-search] SoundCloud users failed:", error);
    return [];
  }
}

export async function searchArtists(
  rawQuery: string,
  source: "all" | TrackSource,
  region: RegionCode,
  creds?: ArtistSearchByok
): Promise<ArtistSearchItem[]> {
  const q = rawQuery.trim();
  if (!q) return [];

  // 1. Direct Artist URL pasted in Search Bar (Spotify Artist, YouTube @handle, SoundCloud profile)
  const spUrlMatch = q.match(SPOTIFY_ARTIST_URL_RE);
  if (spUrlMatch?.[1]) {
    return searchSpotifyArtists("", region, creds, spUrlMatch[1]);
  }

  const ytHandleMatch = q.match(YOUTUBE_HANDLE_URL_RE);
  if (ytHandleMatch?.[1]) {
    return searchYouTubeChannels("", region, creds, ytHandleMatch[1]);
  }

  const scProfileMatch = q.match(SOUNDCLOUD_PROFILE_URL_RE);
  if (scProfileMatch?.[1]) {
    return searchSoundCloudUsers("", creds, scProfileMatch[1]);
  }

  // 2. Match VERIFIED_ARTISTS first (always pinned #1)
  const qLower = q.toLowerCase();
  const verifiedMatches: ArtistSearchItem[] = VERIFIED_ARTISTS.filter(
    (v) =>
      v.displayName.toLowerCase().includes(qLower) ||
      v.aliases.some((alias) => alias.includes(qLower) || qLower.includes(alias))
  ).map(verifiedToSearchItem);

  const wantSp = source === "all" || source === "spotify";
  const wantYt = source === "all" || source === "youtube";
  const wantSc = source === "all" || source === "soundcloud";

  const [spArtists, ytChannels, scUsers] = await Promise.all([
    wantSp ? searchSpotifyArtists(q, region, creds) : Promise.resolve([]),
    wantYt ? searchYouTubeChannels(q, region, creds) : Promise.resolve([]),
    wantSc ? searchSoundCloudUsers(q, creds) : Promise.resolve([]),
  ]);

  // 3. Merge & Deduplicate (Verified > Spotify > YouTube > SoundCloud)
  const merged = [...verifiedMatches, ...spArtists, ...ytChannels, ...scUsers];
  const seen = new Set<string>();
  const deduped: ArtistSearchItem[] = [];

  for (const item of merged) {
    const key = normKey(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  // 4. Keep verified artists pinned at top, then boost artists matching selected region
  const verifiedCount = verifiedMatches.length;
  const pinned = deduped.slice(0, verifiedCount);
  const rest = deduped.slice(verifiedCount);

  if (region !== "ALL") {
    rest.sort((a, b) => {
      const aReg = a.region === region ? 1 : 0;
      const bReg = b.region === region ? 1 : 0;
      if (aReg !== bReg) return bReg - aReg;
      return (b.followers ?? 0) - (a.followers ?? 0);
    });
  }

  return [...pinned, ...rest].slice(0, 8);
}
