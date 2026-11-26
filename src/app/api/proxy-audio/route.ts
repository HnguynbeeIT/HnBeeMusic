import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ALLOWED_HOST_SUFFIXES = [
  "googlevideo.com",
  "sndcdn.com",
  "soundcloud.com",
  "soundcloud.cloud",
  "kavin.rocks",
  "adminforge.de",
  "private.coffee",
  "r4fo.com",
  "nadeko.net",
  "yewtu.be",
  "nerdvpn.de",
  "cobalt.tools",
  "audius.co",
  "audius.org",
  "content-node.audius.co",
];

const IOS_YOUTUBE_UA =
  "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)";

// googlevideo.com iOS adaptiveFormats reject open-ended `Range: bytes=0-` with 403,
// but reliably return 206 Partial Content for bounded byte ranges (<= 512 KB).
const GOOGLEVIDEO_MAX_CHUNK_BYTES = 524_288; // 512 KB (~32s of 128kbps AAC per chunk)

function isAllowedAudioUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      host === "0.0.0.0" ||
      host.startsWith("[::")
    ) {
      return null;
    }
    const allowed = ALLOWED_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    );
    return allowed ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Normalizes Range header for googlevideo.com so every request has an explicit,
 * bounded `bytes=start-end` (preventing 403 Forbidden on open-ended `bytes=0-`
 * while keeping iOS Safari 2-byte `bytes=0-1` probes intact).
 */
function buildBoundedGoogleVideoRange(
  clientRange: string | null,
  targetUrl: URL
): string {
  const clenParam = Number(targetUrl.searchParams.get("clen") || "0");
  const totalLen = Number.isFinite(clenParam) && clenParam > 0 ? clenParam : 0;

  let start = 0;
  let requestedEnd: number | null = null;

  if (clientRange) {
    const match = clientRange.match(/bytes=(\d+)-(\d*)/i);
    if (match) {
      start = Math.max(0, Number(match[1]) || 0);
      if (match[2]) {
        requestedEnd = Number(match[2]);
      }
    }
  }

  const maxChunkEnd = start + GOOGLEVIDEO_MAX_CHUNK_BYTES - 1;
  let end =
    requestedEnd !== null && requestedEnd >= start
      ? Math.min(requestedEnd, maxChunkEnd)
      : maxChunkEnd;

  if (totalLen > 0) {
    if (start >= totalLen) {
      start = Math.max(0, totalLen - 1);
    }
    end = Math.min(end, totalLen - 1);
  }

  return `bytes=${start}-${end}`;
}

async function handleProxy(request: NextRequest, method: "GET" | "HEAD") {
  const { searchParams } = new URL(request.url);
  const targetRaw = (searchParams.get("url") || "").trim();
  const targetUrl = isAllowedAudioUrl(targetRaw);

  if (!targetUrl) {
    return NextResponse.json(
      { error: "URL luồng âm thanh không hợp lệ hoặc không được phép." },
      { status: 400 }
    );
  }

  const isGoogleVideo = targetUrl.hostname.endsWith("googlevideo.com");
  const upstreamHeaders = new Headers();
  const clientRange = request.headers.get("range");

  if (isGoogleVideo) {
    upstreamHeaders.set(
      "Range",
      buildBoundedGoogleVideoRange(clientRange, targetUrl)
    );
  } else if (clientRange) {
    upstreamHeaders.set("Range", clientRange);
  }

  upstreamHeaders.set(
    "User-Agent",
    isGoogleVideo
      ? IOS_YOUTUBE_UA
      : "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1"
  );
  upstreamHeaders.set("Accept", "*/*");
  upstreamHeaders.set("Accept-Encoding", "identity");

  try {
    const upstream = await fetch(targetUrl.toString(), {
      method: method === "HEAD" && isGoogleVideo ? "GET" : method,
      headers: upstreamHeaders,
      redirect: "follow",
      cache: "no-store",
    });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: `Upstream audio returned HTTP ${upstream.status}` },
        {
          status:
            upstream.status >= 400 && upstream.status < 600
              ? upstream.status
              : 502,
        }
      );
    }

    const resHeaders = new Headers();
    const contentType =
      upstream.headers.get("content-type") ||
      (isGoogleVideo ? "audio/mp4" : "audio/mpeg");
    resHeaders.set("Content-Type", contentType);
    resHeaders.set(
      "Accept-Ranges",
      upstream.headers.get("accept-ranges") || "bytes"
    );
    resHeaders.set("Access-Control-Allow-Origin", "*");
    resHeaders.set(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges, Content-Type"
    );
    resHeaders.set("Cache-Control", "private, max-age=3600");

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) resHeaders.set("Content-Length", contentLength);

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) resHeaders.set("Content-Range", contentRange);

    if (method === "HEAD") {
      try {
        await upstream.body?.cancel();
      } catch {}
      return new Response(null, {
        status: upstream.status,
        headers: resHeaders,
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch (error) {
    console.error("[api/proxy-audio] error:", error);
    return NextResponse.json(
      { error: "Không thể proxy luồng âm thanh." },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleProxy(request, "GET");
}

export async function HEAD(request: NextRequest) {
  return handleProxy(request, "HEAD");
}
