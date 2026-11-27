import { NextRequest, NextResponse } from "next/server";
import { ensureAdaptersRegistered, zingMp3Adapter } from "@/adapters";
import { handleUnifiedStreamRequest } from "@/controllers/stream.controller";
import {
  getTrendingTracksBySource,
  zingMp3ProviderAdapter,
} from "@/lib/adapters/extended-providers";
import { matchSpotifyTrackToAudio } from "@/lib/adapters/spotify";
import { extractYouTubeId } from "@/lib/audio/url-parser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function tryServerFallbackStream(
  request: NextRequest,
  id: string,
  titleHint: string,
  artistHint: string,
  durationHint: number
): Promise<NextResponse | null> {
  let title = titleHint;
  let artist = artistHint;
  let duration = durationHint;

  if (!title) {
    const info = await zingMp3Adapter.getTrackInfo(id);
    if (info) {
      title = info.title;
      artist = info.artists.join(", ");
      duration = info.duration;
    }
  }
  if (!title) return null;

  const matched = await matchSpotifyTrackToAudio({
    id: `zingmp3:${id}`,
    title,
    artist,
    thumbnail: "",
    duration,
    source: "zingmp3",
    sourceUrl: `https://zingmp3.vn/bai-hat/${id}.html`,
  });

  if (!matched.streamUrl || !matched.resolvedSource) return null;

  if (matched.resolvedSource === "youtube") {
    const ytId = extractYouTubeId(matched.streamUrl);
    if (ytId) {
      const ytStream = await handleUnifiedStreamRequest(
        request,
        `youtube:${ytId}`
      );
      if (ytStream.status === 200 || ytStream.status === 206) {
        return ytStream;
      }
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  ensureAdaptersRegistered();
  const { searchParams } = request.nextUrl;
  const action = (searchParams.get("action") || "stream").toLowerCase();

  if (action === "trending") {
    const limit = Math.min(Number(searchParams.get("limit") || "12") || 12, 20);
    const tracks = await getTrendingTracksBySource("zingmp3", limit);
    return NextResponse.json({ tracks });
  }

  if (action === "search") {
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(Number(searchParams.get("limit") || "8") || 8, 20);
    if (!q) return NextResponse.json({ tracks: [] });
    const tracks = await zingMp3ProviderAdapter.search(q, limit);
    return NextResponse.json({ tracks });
  }

  if (action === "resolve") {
    const url = (searchParams.get("url") || "").trim();
    if (!url) {
      return NextResponse.json(
        { error: "Missing url parameter." },
        { status: 400 }
      );
    }
    const resolved = await zingMp3ProviderAdapter.resolveUrl(url);
    if (!resolved) {
      return NextResponse.json(
        { error: "Không thể giải mã liên kết Zing MP3 này." },
        { status: 404 }
      );
    }
    return NextResponse.json(resolved);
  }

  if (action === "lyrics") {
    const id = (searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json(
        { error: "Missing id parameter." },
        { status: 400 }
      );
    }
    const lyrics = await zingMp3Adapter.getLyrics(id);
    return NextResponse.json(
      lyrics
        ? {
            synced: lyrics.lines.map((l) => ({
              time: l.timeMs / 1000,
              text: l.text,
            })),
            plain: lyrics.plainText ?? null,
            source: "zingmp3",
          }
        : { synced: [], plain: null, source: "none" }
    );
  }

  const id = (searchParams.get("id") || "").trim();
  if (!id) {
    return NextResponse.json(
      { error: "Missing id parameter." },
      { status: 400 }
    );
  }

  const primary = await handleUnifiedStreamRequest(request, `zingmp3:${id}`);
  if (primary.status === 200 || primary.status === 206) {
    return primary;
  }

  const titleHint = (searchParams.get("title") || "").trim();
  const artistHint = (searchParams.get("artist") || "").trim();
  const durationHint = Number(searchParams.get("duration") || "0") || 0;

  const fallback = await tryServerFallbackStream(
    request,
    id,
    titleHint,
    artistHint,
    durationHint
  );
  if (fallback) {
    return fallback;
  }

  return primary;
}
