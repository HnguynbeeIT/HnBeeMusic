import { NextRequest, NextResponse } from "next/server";
import {
  audiusAdapter,
  ensureAdaptersRegistered,
  zingMp3Adapter,
} from "@/adapters";
import { handleUnifiedStreamRequest } from "@/controllers/stream.controller";
import {
  getTrendingTracksBySource,
  zingMp3ProviderAdapter,
} from "@/lib/adapters/extended-providers";
import {
  resolveSoundCloudStream,
  searchSoundCloud,
} from "@/lib/adapters/soundcloud";
import { matchSpotifyTrackToAudio } from "@/lib/adapters/spotify";
import { scoreCandidate } from "@/lib/audio/strict-match";
import { extractYouTubeId } from "@/lib/audio/url-parser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function proxyDirectFallbackUrl(
  request: NextRequest,
  streamUrl: string,
  extraHeaders: Record<string, string> = {}
): Promise<NextResponse | null> {
  const clientRange = request.headers.get("range");
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "*/*",
    ...extraHeaders,
  };
  if (clientRange) {
    headers.Range = clientRange;
  }

  try {
    const upstream = await fetch(streamUrl, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(4500),
    });

    if (!upstream.ok && upstream.status !== 206) return null;

    const ct = (upstream.headers.get("content-type") || "").toLowerCase();
    if (
      ct.includes("text/html") ||
      ct.includes("application/json") ||
      upstream.headers.get("content-length") === "0"
    ) {
      try {
        await upstream.body?.cancel();
      } catch {}
      return null;
    }

    const outHeaders = new Headers({
      "Content-Type": ct || "audio/mpeg",
      "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "X-HnBee-Source": "zingmp3-fallback",
    });
    const cl = upstream.headers.get("content-length");
    const cr = upstream.headers.get("content-range");
    if (cl) outHeaders.set("Content-Length", cl);
    if (cr) outHeaders.set("Content-Range", cr);

    const status = upstream.status === 206 || Boolean(cr) ? 206 : 200;
    return new NextResponse(request.method === "HEAD" ? null : upstream.body, {
      status,
      headers: outHeaders,
    });
  } catch {
    return null;
  }
}

async function trySoundCloudDirectFallback(
  request: NextRequest,
  title: string,
  artist: string,
  duration: number
): Promise<NextResponse | null> {
  try {
    const candidates = await searchSoundCloud(`${title} ${artist}`.trim(), 5);
    const ranked = candidates
      .filter((c) => !c.isSnippet && c.duration >= 45)
      .map((c) => ({
        track: c,
        score: scoreCandidate(
          { title, artist, duration },
          { title: c.title, artist: c.artist, duration: c.duration }
        ),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    const best = ranked[0]?.track;
    if (!best) return null;

    const resolved = await resolveSoundCloudStream(best.sourceUrl);
    if (!resolved?.streamUrl || resolved.isSnippet) return null;
    if (/\.m3u8(\?|$)/i.test(resolved.streamUrl)) return null;

    return proxyDirectFallbackUrl(request, resolved.streamUrl, {
      Referer: "https://soundcloud.com/",
      Origin: "https://soundcloud.com",
    });
  } catch {
    return null;
  }
}

async function tryAudiusDirectFallback(
  request: NextRequest,
  title: string,
  artist: string,
  duration: number
): Promise<NextResponse | null> {
  try {
    const candidates = await audiusAdapter.search(
      `${title} ${artist}`.trim(),
      5
    );
    const ranked = candidates
      .filter((c) => c.duration >= 45)
      .map((c) => ({
        track: c,
        score: scoreCandidate(
          { title, artist, duration },
          {
            title: c.title,
            artist: c.artists.join(", "),
            duration: c.duration,
          }
        ),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    const best = ranked[0]?.track;
    if (!best) return null;

    const stream = await audiusAdapter.getStreamUrl(best.id);
    if (!stream?.url) return null;
    return proxyDirectFallbackUrl(request, stream.url);
  } catch {
    return null;
  }
}

async function tryYouTubeDirectFallback(
  request: NextRequest,
  id: string,
  title: string,
  artist: string,
  duration: number
): Promise<NextResponse | null> {
  try {
    const matched = await matchSpotifyTrackToAudio({
      id: `zingmp3:${id}`,
      title,
      artist,
      thumbnail: "",
      duration,
      source: "zingmp3",
      sourceUrl: `https://zingmp3.vn/bai-hat/${id}.html`,
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
    return null;
  } catch {
    return null;
  }
}

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

  try {
    return await Promise.any([
      trySoundCloudDirectFallback(request, title, artist, duration).then(
        (res) => (res ? res : Promise.reject(new Error("sc_miss")))
      ),
      tryYouTubeDirectFallback(request, id, title, artist, duration).then(
        (res) => (res ? res : Promise.reject(new Error("yt_miss")))
      ),
      tryAudiusDirectFallback(request, title, artist, duration).then((res) =>
        res ? res : Promise.reject(new Error("audius_miss"))
      ),
    ]);
  } catch {
    return null;
  }
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
