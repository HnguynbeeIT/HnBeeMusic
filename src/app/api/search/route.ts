import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import type { SearchResponse, TrackSource, UnifiedTrack } from "@/lib/audio/types";
import { searchYouTube } from "@/lib/adapters/youtube";
import { searchSoundCloud } from "@/lib/adapters/soundcloud";
import { searchSpotify } from "@/lib/adapters/spotify";
import { searchFallbackCatalog } from "@/lib/adapters/fallback-catalog";

export const maxDuration = 30;

async function executeSearch(
  query: string,
  source: "all" | TrackSource,
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

  const [ytTracks, scTracks, spTracks] = await Promise.all([
    wantYt && hasYtKey ? searchYouTube(query, 8, ytKey) : Promise.resolve([]),
    wantSc
      ? searchSoundCloud(query, 8, byok?.soundcloudClientId)
      : Promise.resolve([]),
    wantSp && hasSpKey
      ? searchSpotify(query, 6, {
          clientId: spId,
          clientSecret: spSecret,
        })
      : Promise.resolve([]),
  ]);

  const merged: UnifiedTrack[] = [...spTracks, ...ytTracks, ...scTracks];

  if (merged.length === 0) {
    return {
      tracks: searchFallbackCatalog(query, source),
      sources: {
        youtube: hasYtKey ? "live" : "fallback",
        soundcloud: "fallback",
        spotify: hasSpKey ? "live" : "fallback",
      },
    };
  }

  return {
    tracks: merged,
    sources: {
      youtube: hasYtKey ? "live" : "fallback",
      soundcloud: scTracks.length > 0 ? "live" : "fallback",
      spotify: hasSpKey ? "live" : "fallback",
    },
  };
}

const runCachedSearch = unstable_cache(
  async (
    query: string,
    source: "all" | TrackSource,
    _envSig: string
  ) => {
    const res = await executeSearch(query, source);
    return { ...res, cached: true };
  },
  ["hnbee-multi-source-search-v3"],
  { revalidate: 1800 }
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") || "").trim();
  const rawSource = (searchParams.get("source") || "all").toLowerCase();
  const source: "all" | TrackSource =
    rawSource === "youtube" ||
    rawSource === "soundcloud" ||
    rawSource === "spotify"
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
      ? await executeSearch(query, source, {
          youtubeApiKey: ytHeader || undefined,
          spotifyClientId: spIdHeader || undefined,
          spotifyClientSecret: spSecretHeader || undefined,
          soundcloudClientId: scClientIdHeader || undefined,
        })
      : await runCachedSearch(query, source, envSig);
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": hasByok
          ? "private, no-store"
          : "public, s-maxage=900, stale-while-revalidate=1800",
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
