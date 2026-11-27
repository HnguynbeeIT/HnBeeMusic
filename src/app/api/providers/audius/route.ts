import { NextRequest, NextResponse } from "next/server";
import { ensureAdaptersRegistered } from "@/adapters";
import { handleUnifiedStreamRequest } from "@/controllers/stream.controller";
import {
  audiusProviderAdapter,
  getTrendingTracksBySource,
} from "@/lib/adapters/extended-providers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  ensureAdaptersRegistered();
  const { searchParams } = request.nextUrl;
  const action = (searchParams.get("action") || "stream").toLowerCase();

  if (action === "trending") {
    const limit = Math.min(Number(searchParams.get("limit") || "12") || 12, 20);
    const tracks = await getTrendingTracksBySource("audius", limit);
    return NextResponse.json({ tracks });
  }

  if (action === "search") {
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(Number(searchParams.get("limit") || "8") || 8, 20);
    if (!q) return NextResponse.json({ tracks: [] });
    const tracks = await audiusProviderAdapter.search(q, limit);
    return NextResponse.json({ tracks });
  }

  if (action === "resolve") {
    const url = (searchParams.get("url") || "").trim();
    if (!url) {
      return NextResponse.json({ error: "Missing url parameter." }, { status: 400 });
    }
    const resolved = await audiusProviderAdapter.resolveUrl(url);
    if (!resolved) {
      return NextResponse.json(
        { error: "Không thể giải mã liên kết Audius này." },
        { status: 404 }
      );
    }
    return NextResponse.json(resolved);
  }

  // Default: Direct Audius Open Discovery MP3 stream proxy with HTTP 206 Partial Content
  const id = (searchParams.get("id") || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id parameter." }, { status: 400 });
  }
  return handleUnifiedStreamRequest(request, `audius:${id}`);
}
