import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import type { SearchResponse, TrackSource, UnifiedTrack } from "@/lib/audio/types";
import {
  parseRegionCode,
  sortTracksByRegion,
  type RegionCode,
} from "@/lib/audio/region";
import { searchYouTubeWithStatus } from "@/lib/adapters/youtube";
import { searchSoundCloud } from "@/lib/adapters/soundcloud";
import { searchSpotify } from "@/lib/adapters/spotify";
import {
  appleMusicProviderAdapter,
  audiusProviderAdapter,
  getTrendingTracksBySource,
  nhacCuaTuiProviderAdapter,
  zingMp3ProviderAdapter,
} from "@/lib/adapters/extended-providers";
import {
  enrichArtistsWithTrackSignals,
  searchArtists,
} from "@/lib/adapters/artist-search";
import { searchFallbackCatalog } from "@/lib/adapters/fallback-catalog";

export const maxDuration = 30;

async function executeSearch(
  query: string,
  source: "all" | TrackSource,
  region: RegionCode,
  byok?: {
    youtubeApiKey?: string;
    spotifyClientId?: string;
    spotifyClientSecret?: string;
    soundcloudClientId?: string;
  }
): Promise<SearchResponse> {
  const ytKey = byok?.youtubeApiKey || process.env.YOUTUBE_API_KEY;
  const spId = byok?.spotifyClientId || process.env.SPOTIFY_CLIENT_ID;
  const spSecret =
    byok?.spotifyClientSecret || process.env.SPOTIFY_CLIENT_SECRET;

  const hasYtKey = Boolean(ytKey);
  const hasSpKey = Boolean(spId && spSecret);

  const wantYt = source === "all" || source === "youtube";
  const wantSc = source === "all" || source === "soundcloud";
  const wantSp = source === "all" || source === "spotify";
  const wantZing = source === "all" || source === "zingmp3";
  const wantNct = source === "nhaccuatui";
  const wantApple = source === "all" || source === "apple_music";
  const wantAudius = source === "all" || source === "audius";

  const [
    ytResult,
    scTracks,
    spTracks,
    zingTracks,
    nctTracks,
    appleTracks,
    audiusTracks,
    artists,
  ] = await Promise.all([
    wantYt
      ? searchYouTubeWithStatus(query, 8, ytKey, region)
      : Promise.resolve({ tracks: [] as UnifiedTrack[], status: "api" as const }),
    wantSc
      ? searchSoundCloud(query, 8, byok?.soundcloudClientId)
      : Promise.resolve([]),
    wantSp && hasSpKey
      ? searchSpotify(
          query,
          6,
          { clientId: spId, clientSecret: spSecret },
          region
        )
      : Promise.resolve([]),
    wantZing
      ? zingMp3ProviderAdapter.search(query, source === "zingmp3" ? 12 : 4)
      : Promise.resolve([]),
    wantNct
      ? nhacCuaTuiProviderAdapter.search(query, 12)
      : Promise.resolve([]),
    wantApple
      ? appleMusicProviderAdapter.search(query, source === "apple_music" ? 12 : 4)
      : Promise.resolve([]),
    wantAudius
      ? audiusProviderAdapter.search(query, source === "audius" ? 12 : 4)
      : Promise.resolve([]),
    searchArtists(query, source, region, {
      youtubeApiKey: ytKey,
      spotifyClientId: spId,
      spotifyClientSecret: spSecret,
      soundcloudClientId: byok?.soundcloudClientId,
    }),
  ]);

  const ytTracks = ytResult.tracks;
  const merged: UnifiedTrack[] = sortTracksByRegion(
    [
      ...spTracks,
      ...zingTracks,
      ...nctTracks,
      ...ytTracks,
      ...appleTracks,
      ...scTracks,
      ...audiusTracks,
    ],
    region
  );

  if (merged.length === 0 && artists.length === 0) {
    return {
      tracks: searchFallbackCatalog(query, source),
      artists: [],
      youtubeStatus: ytResult.status,
      sources: {
        youtube: ytResult.status === "api" ? "live" : ytResult.status,
        soundcloud: "fallback",
        spotify: hasSpKey ? "live" : "fallback",
        zingmp3: zingTracks.length > 0 ? "live" : "fallback",
        nhaccuatui: nctTracks.length > 0 ? "live" : "fallback",
        apple_music: appleTracks.length > 0 ? "live" : "fallback",
        audius: audiusTracks.length > 0 ? "live" : "fallback",
      },
    };
  }

  const enrichedArtists = enrichArtistsWithTrackSignals(
    artists,
    merged,
    region
  );

  return {
    tracks: merged,
    artists: enrichedArtists,
    youtubeStatus: ytResult.status,
    sources: {
      youtube: ytResult.status === "api" ? "live" : ytResult.status,
      soundcloud: scTracks.length > 0 ? "live" : "fallback",
      spotify: hasSpKey ? "live" : "fallback",
      zingmp3: zingTracks.length > 0 ? "live" : "fallback",
      nhaccuatui: nctTracks.length > 0 ? "live" : "fallback",
      apple_music: appleTracks.length > 0 ? "live" : "fallback",
      audius: audiusTracks.length > 0 ? "live" : "fallback",
    },
  };
}

const runCachedProviderTrending = unstable_cache(
  async (source: TrackSource) => {
    return getTrendingTracksBySource(source, 12);
  },
  ["hnbee-provider-trending-v2"],
  { revalidate: 900 }
);

const runCachedSearch = unstable_cache(
  async (
    query: string,
    source: "all" | TrackSource,
    region: RegionCode,
    _envSig: string
  ) => {
    const res = await executeSearch(query, source, region);
    return { ...res, cached: true };
  },
  ["hnbee-multi-source-search-v8"],
  { revalidate: 1800 }
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") || "").trim();
  const region = parseRegionCode(searchParams.get("region"));
  const rawSource = (searchParams.get("source") || "all").toLowerCase();
  const source: "all" | TrackSource =
    rawSource === "youtube" ||
    rawSource === "soundcloud" ||
    rawSource === "spotify" ||
    rawSource === "zingmp3" ||
    rawSource === "nhaccuatui" ||
    rawSource === "apple_music" ||
    rawSource === "audius"
      ? rawSource
      : "all";

  const ytHeader =
    request.headers.get("x-youtube-key")?.trim() ||
    request.headers.get("x-youtube-api-key")?.trim() ||
    "";
  const spIdHeader =
    request.headers.get("x-spotify-id")?.trim() ||
    request.headers.get("x-spotify-client-id")?.trim() ||
    "";
  const spSecretHeader =
    request.headers.get("x-spotify-secret")?.trim() ||
    request.headers.get("x-spotify-client-secret")?.trim() ||
    "";
  const scClientIdHeader =
    request.headers.get("x-soundcloud-client-id")?.trim() || "";
  const hasByok = Boolean(
    ytHeader || (spIdHeader && spSecretHeader) || scClientIdHeader
  );

  if (!query) {
    if (
      source === "zingmp3" ||
      source === "nhaccuatui" ||
      source === "apple_music" ||
      source === "audius"
    ) {
      const trendingTracks = await runCachedProviderTrending(source);
      return NextResponse.json<SearchResponse>(
        {
          tracks: trendingTracks,
          artists: [],
          sources: {
            youtube: ytHeader || process.env.YOUTUBE_API_KEY ? "live" : "fallback",
            soundcloud: "live",
            spotify:
              (spIdHeader && spSecretHeader) ||
              (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
                ? "live"
                : "fallback",
            [source]: trendingTracks.length > 0 ? "live" : "fallback",
          },
          cached: true,
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
          },
        }
      );
    }

    return NextResponse.json<SearchResponse>({
      tracks: searchFallbackCatalog("", source),
      sources: {
        youtube: ytHeader || process.env.YOUTUBE_API_KEY ? "live" : "fallback",
        soundcloud: "live",
        spotify:
          (spIdHeader && spSecretHeader) ||
          (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
            ? "live"
            : "fallback",
      },
    });
  }

  try {
    const envSig = `${Boolean(process.env.YOUTUBE_API_KEY)}:${Boolean(
      process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET
    )}`;
    const result = hasByok
      ? await executeSearch(query, source, region, {
          youtubeApiKey: ytHeader || undefined,
          spotifyClientId: spIdHeader || undefined,
          spotifyClientSecret: spSecretHeader || undefined,
          soundcloudClientId: scClientIdHeader || undefined,
        })
      : await runCachedSearch(query, source, region, envSig);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": hasByok
          ? "private, no-store"
          : "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[api/search] error:", error);
    return NextResponse.json<SearchResponse>({
      tracks: searchFallbackCatalog(query, source),
      sources: { youtube: "error", soundcloud: "error", spotify: "error" },
    });
  }
}
