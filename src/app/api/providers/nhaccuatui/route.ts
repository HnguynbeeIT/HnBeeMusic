import { NextRequest, NextResponse } from "next/server";
import { ensureAdaptersRegistered, nctAdapter } from "@/adapters";
import { handleUnifiedStreamRequest } from "@/controllers/stream.controller";
import {
  getTrendingTracksBySource,
  nhacCuaTuiProviderAdapter,
} from "@/lib/adapters/extended-providers";
import { matchSpotifyTrackToAudio } from "@/lib/adapters/spotify";
import { extractYouTubeId } from "@/lib/audio/url-parser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  ensureAdaptersRegistered();
  const { searchParams } = request.nextUrl;
  const action = (searchParams.get("action") || "stream").toLowerCase();

  if (action === "trending") {
    const limit = Math.min(Number(searchParams.get("limit") || "12") || 12, 20);
    const tracks = await getTrendingTracksBySource("nhaccuatui", limit);
    return NextResponse.json({ tracks });
  }

  if (action === "search") {
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(Number(searchParams.get("limit") || "8") || 8, 20);
    if (!q) return NextResponse.json({ tracks: [] });
    const tracks = await nhacCuaTuiProviderAdapter.search(q, limit);
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
    const resolved = await nhacCuaTuiProviderAdapter.resolveUrl(url);
    if (!resolved) {
      return NextResponse.json(
        { error: "Không thể giải mã liên kết NhacCuaTui này." },
        { status: 404 }
      );
    }
    return NextResponse.json(resolved);
  }

  const id = (searchParams.get("id") || "").trim();
  if (!id) {
    return NextResponse.json(
      { error: "Missing id parameter." },
      { status: 400 }
    );
  }

  const primary = await handleUnifiedStreamRequest(request, `nct:${id}`);
  if (primary.status === 200 || primary.status === 206) {
    return primary;
  }

  let title = (searchParams.get("title") || "").trim();
  let artist = (searchParams.get("artist") || "").trim();
  let duration = Number(searchParams.get("duration") || "0") || 0;

  if (!title) {
    const info = await nctAdapter.getTrackInfo(id);
    if (info) {
      title = info.title;
      artist = info.artists.join(", ");
      duration = info.duration;
    }
  }

  if (title) {
    const matched = await matchSpotifyTrackToAudio({
      id: `nhaccuatui:${id}`,
      title,
      artist,
      thumbnail: "",
      duration,
      source: "nhaccuatui",
      sourceUrl: `https://www.nhaccuatui.com/bai-hat/${id}.html`,
    });
    if (matched.resolvedSource === "youtube" && matched.streamUrl) {
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
  }

  return primary;
}
