import { NextRequest, NextResponse } from "next/server";
import { aggregatorService } from "@/services/aggregator.service";
import { parseUnifiedId } from "@/types/audio";

const UPSTREAM_TIMEOUT_MS = 12_000;
const DEFAULT_AUDIO_MIME = "audio/mpeg";
const DEFAULT_PROXY_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function createCorsHeaders(extra: Record<string, string> = {}): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Range, Accept-Ranges, Content-Type",
    "Cache-Control": "no-store",
    ...extra,
  });
  return headers;
}

/**
 * Audio Stream Proxy Controller for `GET /api/stream/:unifiedId`.
 * - Resolves StreamData via AggregatorService (with TTL cache).
 * - Attaches upstream anti-hotlink headers (`Referer`, `User-Agent`, `Cookie`, etc.).
 * - Forwards client HTTP `Range` requests and returns `206 Partial Content` for smooth seeking.
 */
export async function handleUnifiedStreamRequest(
  request: NextRequest,
  rawUnifiedId: string
): Promise<NextResponse> {
  const parsed = parseUnifiedId(rawUnifiedId);
  if (!parsed) {
    return NextResponse.json(
      {
        error: "Invalid unifiedId format. Expected '<source>:<id>'.",
        received: rawUnifiedId,
      },
      { status: 400, headers: createCorsHeaders() }
    );
  }

  const normalizedUnifiedId = `${parsed.source}:${parsed.id}`;
  const bypassCache =
    request.nextUrl.searchParams.get("refresh") === "1" ||
    request.nextUrl.searchParams.get("nocache") === "1";

  let streamData = await aggregatorService.getStreamUrl(normalizedUnifiedId, {
    bypassCache,
  });

  if (!streamData) {
    return NextResponse.json(
      {
        error: "Stream not available for this track.",
        unifiedId: normalizedUnifiedId,
      },
      { status: 404, headers: createCorsHeaders() }
    );
  }

  // DRM-protected platforms (Apple Music FairPlay / Spotify Widevine) require official client SDK playback
  if (streamData.requiresSdk && !streamData.url) {
    return NextResponse.json(
      {
        error: "Track requires official client SDK playback (DRM protected).",
        unifiedId: normalizedUnifiedId,
        requiresSdk: true,
        sdkUri: streamData.sdkUri ?? null,
      },
      { status: 422, headers: createCorsHeaders() }
    );
  }

  const clientRange = request.headers.get("range");
  const buildUpstreamHeaders = (
    customHeaders?: Record<string, string>
  ): Record<string, string> => {
    const merged: Record<string, string> = {
      "User-Agent": DEFAULT_PROXY_UA,
      Accept: "*/*",
      ...(customHeaders ?? {}),
    };
    if (clientRange) {
      merged.Range = clientRange;
    }
    return merged;
  };

  let upstreamResponse: Response | null = null;
  try {
    upstreamResponse = await fetch(streamData.url, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: buildUpstreamHeaders(streamData.headers),
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    // If cached signed URL expired early (403/410), refresh once via adapter
    if (
      (upstreamResponse.status === 403 || upstreamResponse.status === 410) &&
      !bypassCache
    ) {
      const freshStream = await aggregatorService.getStreamUrl(
        normalizedUnifiedId,
        { bypassCache: true }
      );
      if (freshStream && freshStream.url) {
        streamData = freshStream;
        upstreamResponse = await fetch(freshStream.url, {
          method: request.method === "HEAD" ? "HEAD" : "GET",
          headers: buildUpstreamHeaders(freshStream.headers),
          redirect: "follow",
          cache: "no-store",
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upstream fetch failed";
    return NextResponse.json(
      { error: "Failed to connect to upstream audio stream.", detail: message },
      { status: 502, headers: createCorsHeaders() }
    );
  }

  if (!upstreamResponse || (!upstreamResponse.ok && upstreamResponse.status !== 206)) {
    return NextResponse.json(
      {
        error: "Upstream audio server rejected the stream request.",
        upstreamStatus: upstreamResponse?.status ?? 502,
      },
      { status: 502, headers: createCorsHeaders() }
    );
  }

  const contentType =
    upstreamResponse.headers.get("content-type") ||
    streamData.mimeType ||
    DEFAULT_AUDIO_MIME;
  const contentLength = upstreamResponse.headers.get("content-length");
  const contentRange = upstreamResponse.headers.get("content-range");
  const acceptRanges =
    upstreamResponse.headers.get("accept-ranges") || "bytes";

  const responseHeaders = createCorsHeaders({
    "Content-Type": contentType,
    "Accept-Ranges": acceptRanges,
    "X-HnBee-Source": parsed.source,
    "X-HnBee-Quality": streamData.quality,
  });

  if (contentLength) {
    responseHeaders.set("Content-Length", contentLength);
  }
  if (contentRange) {
    responseHeaders.set("Content-Range", contentRange);
  }

  // Return 206 Partial Content whenever upstream served partial bytes or client requested a valid Range
  const status =
    upstreamResponse.status === 206 || Boolean(contentRange) ? 206 : 200;

  return new NextResponse(
    request.method === "HEAD" ? null : upstreamResponse.body,
    {
      status,
      headers: responseHeaders,
    }
  );
}

export function handleUnifiedStreamOptions(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: createCorsHeaders(),
  });
}
