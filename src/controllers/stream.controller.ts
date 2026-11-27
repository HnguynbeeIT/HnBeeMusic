import { NextRequest, NextResponse } from "next/server";
import { aggregatorService } from "@/services/aggregator.service";
import { parseUnifiedId } from "@/types/audio";

const UPSTREAM_TIMEOUT_MS = 10_000;
const GOOGLEVIDEO_CHUNK_BYTES = 524_288;
const DEFAULT_AUDIO_MIME = "audio/mpeg";
const DEFAULT_PROXY_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function createCorsHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Range, Accept-Ranges, Content-Type",
    "Cache-Control": "no-store",
    ...extra,
  });
}

function isPlayableAudioContentType(contentType: string | null): boolean {
  if (!contentType) return true;
  const normalized = contentType.toLowerCase();
  if (
    normalized.includes("text/html") ||
    normalized.includes("application/json") ||
    normalized.includes("application/xml") ||
    normalized.includes("text/xml")
  ) {
    return false;
  }
  return (
    normalized.startsWith("audio/") ||
    normalized.startsWith("video/") ||
    normalized.includes("application/octet-stream") ||
    normalized.includes("binary/octet-stream") ||
    normalized.includes("mpegurl")
  );
}

function normalizeUpstreamRange(
  streamUrl: string,
  clientRange: string | null
): string | null {
  const isGoogleVideo = /googlevideo\.com/i.test(streamUrl);
  if (!isGoogleVideo) return clientRange;

  if (!clientRange) {
    return `bytes=0-${GOOGLEVIDEO_CHUNK_BYTES - 1}`;
  }
  const openEnded = clientRange.match(/^bytes=(\d+)-$/i);
  if (openEnded?.[1]) {
    const start = Number.parseInt(openEnded[1], 10);
    if (Number.isFinite(start) && start >= 0) {
      return `bytes=${start}-${start + GOOGLEVIDEO_CHUNK_BYTES - 1}`;
    }
  }
  return clientRange;
}

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

  if (!streamData || !streamData.url) {
    if (streamData?.requiresSdk) {
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
    return NextResponse.json(
      {
        error: "Stream not available for this track.",
        unifiedId: normalizedUnifiedId,
      },
      { status: 404, headers: createCorsHeaders() }
    );
  }

  const clientRange = request.headers.get("range");
  const buildUpstreamHeaders = (
    targetUrl: string,
    customHeaders?: Record<string, string>
  ): Record<string, string> => {
    const merged: Record<string, string> = {
      "User-Agent": DEFAULT_PROXY_UA,
      Accept: "*/*",
      ...(customHeaders ?? {}),
    };
    const effectiveRange = normalizeUpstreamRange(targetUrl, clientRange);
    if (effectiveRange) {
      merged.Range = effectiveRange;
    }
    return merged;
  };

  let upstreamResponse: Response | null = null;
  try {
    upstreamResponse = await fetch(streamData.url, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers: buildUpstreamHeaders(streamData.url, streamData.headers),
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

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
          headers: buildUpstreamHeaders(freshStream.url, freshStream.headers),
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

  if (
    !upstreamResponse ||
    (!upstreamResponse.ok && upstreamResponse.status !== 206)
  ) {
    return NextResponse.json(
      {
        error: "Upstream audio server rejected the stream request.",
        upstreamStatus: upstreamResponse?.status ?? 502,
      },
      { status: 502, headers: createCorsHeaders() }
    );
  }

  const rawContentType = upstreamResponse.headers.get("content-type");
  const contentLength = upstreamResponse.headers.get("content-length");
  if (!isPlayableAudioContentType(rawContentType) || contentLength === "0") {
    try {
      await upstreamResponse.body?.cancel();
    } catch {}
    return NextResponse.json(
      {
        error: "Upstream returned a non-audio payload.",
        contentType: rawContentType ?? "unknown",
      },
      { status: 502, headers: createCorsHeaders() }
    );
  }

  const contentType = rawContentType || streamData.mimeType || DEFAULT_AUDIO_MIME;
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
