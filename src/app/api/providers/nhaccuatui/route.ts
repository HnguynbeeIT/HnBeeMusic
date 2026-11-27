import { NextRequest, NextResponse } from "next/server";
import { ensureAdaptersRegistered } from "@/adapters";
import { handleUnifiedStreamRequest } from "@/controllers/stream.controller";
import {
  getTrendingTracksBySource,
  nhacCuaTuiProviderAdapter,
} from "@/lib/adapters/extended-providers";

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
      return NextResponse.json({ error: "Missing url parameter." }, { status: 400 });
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

  // Default: NhacCuaTui direct MP3/M4A stream proxy with HTTP 206 Partial Content
  const id = (searchParams.get("id") || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id parameter." }, { status: 400 });
  }
  return handleUnifiedStreamRequest(request, `nct:${id}`);
}
