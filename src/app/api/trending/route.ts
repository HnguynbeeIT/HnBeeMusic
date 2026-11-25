import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  parseRegionCode,
  sortTracksByRegion,
  type RegionCode,
} from "@/lib/audio/region";
import { getTrendingYouTube } from "@/lib/adapters/youtube";
import { FALLBACK_CATALOG } from "@/lib/adapters/fallback-catalog";

export const maxDuration = 30;

const getCachedTrending = unstable_cache(
  async (region: RegionCode, _envSig: string) => {
    const ytTrending = await getTrendingYouTube(region, undefined, 12);
    if (ytTrending.length > 0) {
      return {
        region,
        live: true,
        tracks: sortTracksByRegion(ytTrending, region),
      };
    }
    return {
      region,
      live: false,
      tracks: [...FALLBACK_CATALOG].reverse(),
    };
  },
  ["hnbee-regional-trending-v1"],
  { revalidate: 1800 }
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const region = parseRegionCode(searchParams.get("region"));

  const ytHeader =
    request.headers.get("x-youtube-key")?.trim() ||
    request.headers.get("x-youtube-api-key")?.trim() ||
    "";

  try {
    if (ytHeader) {
      const ytTrending = await getTrendingYouTube(region, ytHeader, 12);
      const tracks =
        ytTrending.length > 0
          ? sortTracksByRegion(ytTrending, region)
          : [...FALLBACK_CATALOG].reverse();
      return NextResponse.json(
        { region, live: ytTrending.length > 0, tracks },
        { headers: { "Cache-Control": "private, no-store" } }
      );
    }

    const envSig = String(Boolean(process.env.YOUTUBE_API_KEY));
    const data = await getCachedTrending(region, envSig);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
      },
    });
  } catch (error) {
    console.error("[api/trending] error:", error);
    return NextResponse.json({
      region,
      live: false,
      tracks: [...FALLBACK_CATALOG].reverse(),
    });
  }
}
