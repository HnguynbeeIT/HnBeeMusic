import { NextRequest, NextResponse } from "next/server";
import { Innertube, ClientType } from "youtubei.js";
import {
  resolveSoundCloudStream,
  searchSoundCloud,
} from "@/lib/adapters/soundcloud";
import {
  cleanSearchTitle,
  extractPrimaryArtist,
  scoreCandidate,
} from "@/lib/audio/strict-match";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const RACE_TIMEOUT_MS = 3500;
const GOOGLEVIDEO_MAX_CHUNK_BYTES = 524_288; // 512 KB (~32s of 128kbps AAC)
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes
const MAX_CACHE_SIZE = 300;

const IOS_YOUTUBE_UA =
  "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)";
const IOS_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1";

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
  "https://pipedapi.r4fo.com",
];

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://yewtu.be",
  "https://invidious.nerdvpn.de",
];

interface ResolvedAudioSource {
  url: string;
  mimeType: string;
  provider: string;
  isGoogleVideo: boolean;
  isHlsPlaylist: boolean;
  userAgent: string;
  contentLength?: number;
  cachedAt: number;
}

const resolvedAudioCache = new Map<string, ResolvedAudioSource>();
let cachedInnertubeIOS: Promise<Innertube> | null = null;

function getInnertubeIOS(): Promise<Innertube> {
  if (!cachedInnertubeIOS) {
    cachedInnertubeIOS = Innertube.create({
      client_type: ClientType.IOS,
      generate_session_locally: true,
      retrieve_player: false,
    }).catch((err) => {
      cachedInnertubeIOS = null;
      throw err;
    });
  }
  return cachedInnertubeIOS;
}

function createTimeoutSignal(ms = RACE_TIMEOUT_MS): AbortSignal {
  if (
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.timeout === "function"
  ) {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

function setCachedSource(key: string, value: ResolvedAudioSource): void {
  if (resolvedAudioCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = resolvedAudioCache.keys().next().value;
    if (oldestKey) resolvedAudioCache.delete(oldestKey);
  }
  resolvedAudioCache.set(key, value);
}

function getCachedSource(key: string): ResolvedAudioSource | null {
  const entry = resolvedAudioCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    resolvedAudioCache.delete(key);
    return null;
  }
  return entry;
}

/**
 * Layer 1: SoundCloud Full-Length Progressive MP3 / AAC-160k HLS (Strict Title & Artist Match)
 */
async function resolveFromSoundCloud(
  title: string,
  artist: string,
  expectedDuration: number,
  scUrl?: string,
  scClientId?: string
): Promise<ResolvedAudioSource> {
  if (scUrl && /soundcloud\.com/i.test(scUrl)) {
    const resolved = await resolveSoundCloudStream(scUrl, scClientId);
    if (
      !resolved.isSnippet &&
      resolved.streamUrl &&
      resolved.streamType !== "widget"
    ) {
      return {
        url: resolved.streamUrl,
        mimeType:
          resolved.streamType === "hls" ? "audio/mpegurl" : "audio/mpeg",
        provider: `soundcloud-${resolved.streamType}`,
        isGoogleVideo: false,
        isHlsPlaylist: resolved.streamType === "hls",
        userAgent: IOS_SAFARI_UA,
        cachedAt: Date.now(),
      };
    }
  }

  if (!title) throw new Error("soundcloud requires title or scUrl");

  const cleanTitle = cleanSearchTitle(title);
  const primaryArtist = extractPrimaryArtist(artist);
  const queryFull = `${cleanTitle} ${artist}`.trim();
  const queryPrimary = `${cleanTitle} ${primaryArtist}`.trim();
  const queries =
    queryPrimary && queryPrimary.toLowerCase() !== queryFull.toLowerCase()
      ? [queryFull, queryPrimary]
      : [queryFull];

  const settled = await Promise.allSettled(
    queries.map((q) => searchSoundCloud(q, 8, scClientId))
  );
  const seen = new Set<string>();
  const candidates = settled
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((c) => {
      if (!c.sourceUrl || seen.has(c.sourceUrl)) return false;
      seen.add(c.sourceUrl);
      return true;
    });

  const scored = candidates
    .filter((c) => !c.isSnippet && (c.duration === 0 || c.duration > 45))
    .map((c) => ({
      track: c,
      score: scoreCandidate(
        { title: c.title, artist: c.artist, duration: c.duration },
        { title, artist, duration: expectedDuration }
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const { track: cand } of scored.slice(0, 2)) {
    const resolved = await resolveSoundCloudStream(cand.sourceUrl, scClientId);
    if (resolved.isSnippet) continue;
    if (resolved.streamUrl && resolved.streamType !== "widget") {
      return {
        url: resolved.streamUrl,
        mimeType:
          resolved.streamType === "hls" ? "audio/mpegurl" : "audio/mpeg",
        provider: `soundcloud-${resolved.streamType}`,
        isGoogleVideo: false,
        isHlsPlaylist: resolved.streamType === "hls",
        userAgent: IOS_SAFARI_UA,
        cachedAt: Date.now(),
      };
    }
  }

  throw new Error("soundcloud no strict full-length stream");
}

/**
 * Layer 2: Audius Open Direct MP3 Stream (Strict Title & Artist Match)
 */
async function resolveFromAudius(
  title: string,
  artist: string,
  expectedDuration: number
): Promise<ResolvedAudioSource> {
  if (!title) throw new Error("audius requires title");
  const q = encodeURIComponent(`${cleanSearchTitle(title)} ${artist}`.trim());
  const res = await fetch(
    `https://discoveryprovider.audius.co/v1/tracks/search?query=${q}&app_name=HnBeeMusic`,
    {
      signal: createTimeoutSignal(RACE_TIMEOUT_MS),
      headers: { Accept: "application/json", "User-Agent": IOS_SAFARI_UA },
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`audius HTTP ${res.status}`);
  const data = (await res.json()) as {
    data?: Array<{
      id?: string;
      title?: string;
      duration?: number;
      user?: { name?: string };
    }>;
  };
  const scored = (data.data ?? [])
    .filter((t) => Boolean(t.id) && (t.duration || 0) > 45)
    .map((t) => ({
      item: t,
      score: scoreCandidate(
        {
          title: t.title || "",
          artist: t.user?.name || "",
          duration: t.duration || 0,
        },
        { title, artist, duration: expectedDuration }
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best?.item?.id) throw new Error("audius no strict match");

  return {
    url: `https://discoveryprovider.audius.co/v1/tracks/${best.item.id}/stream?app_name=HnBeeMusic`,
    mimeType: "audio/mpeg",
    provider: "audius",
    isGoogleVideo: false,
    isHlsPlaylist: false,
    userAgent: IOS_SAFARI_UA,
    cachedAt: Date.now(),
  };
}

/**
 * Layer 3: Rotating Piped / Invidious / Cobalt Cluster (Direct Audio-Only from YouTube ID)
 */
async function resolveFromMirrors(
  videoId: string
): Promise<ResolvedAudioSource> {
  const pipedPromises = PIPED_INSTANCES.map(async (base) => {
    const res = await fetch(`${base}/streams/${videoId}`, {
      signal: createTimeoutSignal(RACE_TIMEOUT_MS),
      headers: { Accept: "application/json", "User-Agent": IOS_SAFARI_UA },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`piped ${base} HTTP ${res.status}`);
    const data = (await res.json()) as {
      audioStreams?: Array<{
        url?: string;
        mimeType?: string;
        bitrate?: number;
      }>;
    };
    const streams = (data.audioStreams ?? [])
      .filter((s) => Boolean(s.url))
      .sort((a, b) => {
        const aMp4 = /mp4|m4a/i.test(a.mimeType || "") ? 1 : 0;
        const bMp4 = /mp4|m4a/i.test(b.mimeType || "") ? 1 : 0;
        if (aMp4 !== bMp4) return bMp4 - aMp4;
        return (b.bitrate || 0) - (a.bitrate || 0);
      });
    const picked = streams[0];
    if (!picked?.url) throw new Error("piped empty");
    return {
      url: picked.url,
      mimeType: /mp4|m4a/i.test(picked.mimeType || "")
        ? "audio/mp4"
        : picked.mimeType || "audio/mp4",
      provider: "piped",
      isGoogleVideo: /googlevideo\.com/i.test(picked.url),
      isHlsPlaylist: false,
      userAgent: IOS_SAFARI_UA,
      cachedAt: Date.now(),
    };
  });

  const invidiousPromises = INVIDIOUS_INSTANCES.map(async (base) => {
    const res = await fetch(
      `${base}/api/v1/videos/${videoId}?fields=adaptiveFormats`,
      {
        signal: createTimeoutSignal(RACE_TIMEOUT_MS),
        headers: { Accept: "application/json", "User-Agent": IOS_SAFARI_UA },
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`invidious ${base} HTTP ${res.status}`);
    const data = (await res.json()) as {
      adaptiveFormats?: Array<{
        url?: string;
        type?: string;
        bitrate?: string | number;
      }>;
    };
    const streams = (data.adaptiveFormats ?? [])
      .filter((f) => Boolean(f.url) && /^audio\//i.test(f.type || ""))
      .sort((a, b) => {
        const aMp4 = /mp4|m4a/i.test(a.type || "") ? 1 : 0;
        const bMp4 = /mp4|m4a/i.test(b.type || "") ? 1 : 0;
        if (aMp4 !== bMp4) return bMp4 - aMp4;
        return Number(b.bitrate || 0) - Number(a.bitrate || 0);
      });
    const picked = streams[0];
    if (!picked?.url) throw new Error("invidious empty");
    return {
      url: picked.url,
      mimeType: /mp4|m4a/i.test(picked.type || "")
        ? "audio/mp4"
        : "audio/mpeg",
      provider: "invidious",
      isGoogleVideo: /googlevideo\.com/i.test(picked.url),
      isHlsPlaylist: false,
      userAgent: IOS_SAFARI_UA,
      cachedAt: Date.now(),
    };
  });

  const cobaltPromise = (async (): Promise<ResolvedAudioSource> => {
    const res = await fetch("https://api.cobalt.tools/", {
      method: "POST",
      signal: createTimeoutSignal(RACE_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": IOS_SAFARI_UA,
      },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        downloadMode: "audio",
        audioFormat: "mp3",
        audioBitrate: "128",
      }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`cobalt HTTP ${res.status}`);
    const data = (await res.json()) as { url?: string };
    if (!data.url) throw new Error("cobalt no url");
    return {
      url: data.url,
      mimeType: "audio/mpeg",
      provider: "cobalt",
      isGoogleVideo: false,
      isHlsPlaylist: false,
      userAgent: IOS_SAFARI_UA,
      cachedAt: Date.now(),
    };
  })();

  return Promise.any([...pipedPromises, ...invidiousPromises, cobaltPromise]);
}

/**
 * Layer 4: Internal `youtubei.js` Decoder (`ClientType.IOS`) -> Direct `audio/mp4` (.m4a AAC)
 */
async function resolveFromYoutubeiJS(
  videoId: string,
  requirePast1500KB = false
): Promise<ResolvedAudioSource> {
  const yt = await getInnertubeIOS();
  const info = await yt.getBasicInfo(videoId, { client: "IOS" });
  const adaptive = info.streaming_data?.adaptive_formats ?? [];
  const audioMp4 = adaptive
    .filter(
      (f) => Boolean(f.url) && /^audio\/mp4/i.test(f.mime_type || "")
    )
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  const picked = audioMp4[0];
  if (!picked?.url) {
    throw new Error("youtubei.js no audio/mp4 format");
  }

  const clen = Number(picked.content_length || 0) || undefined;
  const probeRange =
    requirePast1500KB && clen && clen > 1_600_000
      ? "bytes=1500000-1500001"
      : "bytes=0-1";

  const probe = await fetch(picked.url, {
    headers: {
      Range: probeRange,
      "User-Agent": IOS_YOUTUBE_UA,
    },
    signal: createTimeoutSignal(1800),
    cache: "no-store",
  });
  try {
    await probe.body?.cancel();
  } catch {}
  if (probe.status !== 200 && probe.status !== 206) {
    throw new Error(`youtubei.js probe(${probeRange}) HTTP ${probe.status}`);
  }

  return {
    url: picked.url,
    mimeType: "audio/mp4",
    provider: "youtubei-ios",
    isGoogleVideo: true,
    isHlsPlaylist: false,
    userAgent: IOS_YOUTUBE_UA,
    contentLength: clen,
    cachedAt: Date.now(),
  };
}

function buildBoundedGoogleVideoRange(
  clientRange: string | null,
  targetUrl: string,
  knownLength?: number
): string {
  let totalLen = knownLength || 0;
  if (!totalLen) {
    try {
      const parsed = new URL(targetUrl);
      const clen = Number(parsed.searchParams.get("clen") || "0");
      if (Number.isFinite(clen) && clen > 0) totalLen = clen;
    } catch {}
  }

  let start = 0;
  let requestedEnd: number | null = null;
  if (clientRange) {
    const match = clientRange.match(/bytes=(\d+)-(\d*)/i);
    if (match) {
      start = Math.max(0, Number(match[1]) || 0);
      if (match[2]) requestedEnd = Number(match[2]);
    }
  }

  const maxChunkEnd = start + GOOGLEVIDEO_MAX_CHUNK_BYTES - 1;
  let end =
    requestedEnd !== null && requestedEnd >= start
      ? Math.min(requestedEnd, maxChunkEnd)
      : maxChunkEnd;

  if (totalLen > 0) {
    if (start >= totalLen) start = Math.max(0, totalLen - 1);
    end = Math.min(end, totalLen - 1);
  }

  return `bytes=${start}-${end}`;
}

async function resolveUpstreamAudio(params: {
  videoId: string;
  title: string;
  artist: string;
  duration: number;
  scUrl?: string;
  scClientId?: string;
}): Promise<ResolvedAudioSource> {
  const { videoId, title, artist, duration, scUrl, scClientId } = params;
  const hasValidVideoId = /^[a-zA-Z0-9_-]{11}$/.test(videoId);
  const cacheKey = hasValidVideoId
    ? `yt:${videoId}:${cleanSearchTitle(title).toLowerCase()}`
    : scUrl
    ? `sc:${scUrl}`
    : `meta:${title.toLowerCase()}|${artist.toLowerCase()}`;

  const cached = getCachedSource(cacheKey);
  if (cached) return cached;

  const fullLengthRacers: Array<Promise<ResolvedAudioSource>> = [];

  if (scUrl || title) {
    fullLengthRacers.push(
      resolveFromSoundCloud(title, artist, duration, scUrl, scClientId)
    );
  }
  if (title) {
    fullLengthRacers.push(resolveFromAudius(title, artist, duration));
  }
  if (hasValidVideoId) {
    fullLengthRacers.push(resolveFromMirrors(videoId));
    fullLengthRacers.push(resolveFromYoutubeiJS(videoId, true));
  }

  let winner: ResolvedAudioSource;
  try {
    winner = await Promise.any(fullLengthRacers);
  } catch (err) {
    // Fallback to direct `youtubei.js` IOS audio/mp4 stream so `/api/audio-proxy?v=...`
    // immediately streams valid `audio/mp4` bytes (`206 Partial Content`) even for YouTube-only tracks.
    if (hasValidVideoId) {
      winner = await resolveFromYoutubeiJS(videoId, false);
    } else {
      throw err;
    }
  }

  setCachedSource(cacheKey, winner);
  return winner;
}

/**
 * Direct Audio Stream Proxy (`/api/audio-proxy`) for iOS HTML5 `<audio>`:
 * - Accepts `?v=<youtubeId>&title=...&artist=...&duration=...` (or `&scUrl=...`)
 * - Streams direct `audio/mp4` / `audio/mpeg` / `audio/mpegurl` with full HTTP Range (`206 Partial Content`)
 * - Caches resolved upstream URLs in RAM for 0ms chunk & seek responses
 */
async function handleAudioProxy(request: NextRequest, method: "GET" | "HEAD") {
  const { searchParams } = new URL(request.url);
  const videoId = (
    searchParams.get("v") ||
    searchParams.get("id") ||
    ""
  ).trim();
  const title = (searchParams.get("title") || "").trim();
  const artist = (searchParams.get("artist") || "").trim();
  const duration = Number(searchParams.get("duration") || "0") || 0;
  const scUrl = (searchParams.get("scUrl") || "").trim() || undefined;
  const scClientId =
    request.headers.get("x-soundcloud-client-id")?.trim() || undefined;

  const hasValidVideoId = /^[a-zA-Z0-9_-]{11}$/.test(videoId);
  if (!hasValidVideoId && !title && !scUrl) {
    return NextResponse.json(
      { error: "Thiếu tham số v (youtubeId), scUrl hoặc title." },
      { status: 400 }
    );
  }

  try {
    const resolved = await resolveUpstreamAudio({
      videoId,
      title,
      artist,
      duration,
      scUrl,
      scClientId,
    });

    const upstreamHeaders = new Headers();
    const clientRange = request.headers.get("range");
    if (resolved.isGoogleVideo) {
      upstreamHeaders.set(
        "Range",
        buildBoundedGoogleVideoRange(
          clientRange,
          resolved.url,
          resolved.contentLength
        )
      );
    } else if (clientRange && !resolved.isHlsPlaylist) {
      upstreamHeaders.set("Range", clientRange);
    }
    upstreamHeaders.set("User-Agent", resolved.userAgent);
    upstreamHeaders.set("Accept", "*/*");
    upstreamHeaders.set("Accept-Encoding", "identity");

    const upstream = await fetch(resolved.url, {
      method: method === "HEAD" && resolved.isGoogleVideo ? "GET" : method,
      headers: upstreamHeaders,
      redirect: "follow",
      cache: "no-store",
    });

    if (!upstream.ok && upstream.status !== 206) {
      // Drop stale cached source on upstream failure
      const cacheKey = hasValidVideoId
        ? `yt:${videoId}:${cleanSearchTitle(title).toLowerCase()}`
        : scUrl
        ? `sc:${scUrl}`
        : `meta:${title.toLowerCase()}|${artist.toLowerCase()}`;
      resolvedAudioCache.delete(cacheKey);

      return NextResponse.json(
        {
          error: `Upstream audio (${resolved.provider}) returned HTTP ${upstream.status}`,
        },
        {
          status:
            upstream.status >= 400 && upstream.status < 600
              ? upstream.status
              : 502,
        }
      );
    }

    const resHeaders = new Headers();
    const rawUpstreamType = upstream.headers.get("content-type") || "";
    const contentType = resolved.isHlsPlaylist
      ? "audio/mpegurl"
      : rawUpstreamType.startsWith("audio/")
      ? rawUpstreamType
      : resolved.mimeType;

    resHeaders.set("Content-Type", contentType);
    resHeaders.set(
      "Accept-Ranges",
      upstream.headers.get("accept-ranges") || "bytes"
    );
    resHeaders.set("Access-Control-Allow-Origin", "*");
    resHeaders.set(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges, Content-Type, X-Audio-Provider"
    );
    resHeaders.set("X-Audio-Provider", resolved.provider);
    resHeaders.set("Cache-Control", "private, max-age=1800");

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
    console.warn("[api/audio-proxy] resolution failed:", error);
    return NextResponse.json(
      { error: "Không thể giải mã luồng âm thanh trực tiếp." },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleAudioProxy(request, "GET");
}

export async function HEAD(request: NextRequest) {
  return handleAudioProxy(request, "HEAD");
}
