import { NextRequest, NextResponse } from "next/server";
import {
  resolveSoundCloudStream,
  searchSoundCloud,
} from "@/lib/adapters/soundcloud";
import {
  cleanSearchTitle,
  extractPrimaryArtist,
  scoreCandidate,
} from "@/lib/audio/strict-match";

export const maxDuration = 20;

const RACE_TIMEOUT_MS = 3500;

const IOS_YOUTUBE_UA =
  "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)";

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

interface AudioStreamResult {
  streamUrl: string;
  rawUrl: string;
  provider: string;
  mimeType: string;
  proxied: boolean;
  preservesYouTubeTimeline: boolean;
}

function createTimeoutSignal(ms = RACE_TIMEOUT_MS): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function wrapWithProxy(rawUrl: string): string {
  return `/api/proxy-audio?url=${encodeURIComponent(rawUrl)}`;
}

function needsProxyForIOS(url: string): boolean {
  return /googlevideo\.com|pipedproxy|invidious|yewtu\.be|nadeko\.net|nerdvpn\.de/i.test(
    url
  );
}

/**
 * SOURCE 1A: Direct YouTube InnerTube iOS Client (returns native 128kbps audio/mp4 .m4a!)
 * Proxied through /api/proxy-audio with Range: 206 support for 100% iOS Safari compatibility.
 */
async function extractFromInnerTubeIOS(
  videoId: string,
  requireFullLength = true
): Promise<AudioStreamResult> {
  const res = await fetch(
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    {
      method: "POST",
      signal: createTimeoutSignal(RACE_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": IOS_YOUTUBE_UA,
        "X-YouTube-Client-Name": "5",
        "X-YouTube-Client-Version": "20.10.4",
      },
      body: JSON.stringify({
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
        context: {
          client: {
            clientName: "IOS",
            clientVersion: "20.10.4",
            deviceMake: "Apple",
            deviceModel: "iPhone16,2",
            osName: "iPhone",
            osVersion: "18.3.2.22D82",
            hl: "en",
            gl: "US",
          },
        },
      }),
      cache: "no-store",
    }
  );

  if (!res.ok) throw new Error(`innertube-ios HTTP ${res.status}`);
  const data = (await res.json()) as {
    streamingData?: {
      adaptiveFormats?: Array<{
        url?: string;
        mimeType?: string;
        bitrate?: number;
        contentLength?: string;
      }>;
    };
  };

  const adaptive = data.streamingData?.adaptiveFormats ?? [];
  // Prefer audio/mp4 (AAC .m4a) which plays natively on iOS Safari <audio>
  const m4aFormats = adaptive
    .filter((f) => Boolean(f.url) && /^audio\/mp4/i.test(f.mimeType || ""))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  const picked = m4aFormats[0];
  if (!picked?.url) {
    throw new Error("innertube-ios no m4a audio format");
  }

  // Probe well past the ~1 MB GVS poToken cap (at 1.5 MB) when requiring full-length playback
  // so 1MB-capped YouTube URLs immediately yield to full-length SoundCloud/Audius/Piped/Invidious/Cobalt!
  const clen = Number(picked.contentLength || "0");
  const probeRange =
    requireFullLength && clen > 1_600_000
      ? "bytes=1500000-1500001"
      : "bytes=0-1";

  const probe = await fetch(picked.url, {
    headers: {
      Range: probeRange,
      "User-Agent": IOS_YOUTUBE_UA,
    },
    signal: createTimeoutSignal(1500),
    cache: "no-store",
  });
  try {
    await probe.body?.cancel();
  } catch {}
  if (probe.status !== 200 && probe.status !== 206) {
    throw new Error(`innertube-ios probe(${probeRange}) HTTP ${probe.status}`);
  }

  return {
    streamUrl: wrapWithProxy(picked.url),
    rawUrl: picked.url,
    provider: "innertube-ios",
    mimeType: "audio/mp4",
    proxied: true,
    preservesYouTubeTimeline: true,
  };
}

/**
 * SOURCE 1B: Piped API Cluster (preferring audio/mp4 .m4a for iOS Safari)
 */
async function extractFromPiped(videoId: string): Promise<AudioStreamResult> {
  return Promise.any(
    PIPED_INSTANCES.map(async (base) => {
      const res = await fetch(`${base}/streams/${videoId}`, {
        signal: createTimeoutSignal(RACE_TIMEOUT_MS),
        headers: { Accept: "application/json", "User-Agent": "HnBeeMusic/1.0" },
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
      if (!picked?.url) throw new Error("piped empty audioStreams");

      const shouldProxy = needsProxyForIOS(picked.url);
      return {
        streamUrl: shouldProxy ? wrapWithProxy(picked.url) : picked.url,
        rawUrl: picked.url,
        provider: "piped",
        mimeType: picked.mimeType || "audio/mp4",
        proxied: shouldProxy,
        preservesYouTubeTimeline: true,
      };
    })
  );
}

/**
 * SOURCE 1C: Invidious API Cluster
 */
async function extractFromInvidious(
  videoId: string
): Promise<AudioStreamResult> {
  return Promise.any(
    INVIDIOUS_INSTANCES.map(async (base) => {
      const res = await fetch(
        `${base}/api/v1/videos/${videoId}?fields=adaptiveFormats`,
        {
          signal: createTimeoutSignal(RACE_TIMEOUT_MS),
          headers: { Accept: "application/json", "User-Agent": "HnBeeMusic/1.0" },
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
      const audioFormats = (data.adaptiveFormats ?? [])
        .filter((f) => Boolean(f.url) && /^audio\//i.test(f.type || ""))
        .sort((a, b) => {
          const aMp4 = /mp4|m4a/i.test(a.type || "") ? 1 : 0;
          const bMp4 = /mp4|m4a/i.test(b.type || "") ? 1 : 0;
          if (aMp4 !== bMp4) return bMp4 - aMp4;
          return Number(b.bitrate || 0) - Number(a.bitrate || 0);
        });
      const picked = audioFormats[0];
      if (!picked?.url) throw new Error("invidious empty audio");

      const shouldProxy = needsProxyForIOS(picked.url);
      return {
        streamUrl: shouldProxy ? wrapWithProxy(picked.url) : picked.url,
        rawUrl: picked.url,
        provider: "invidious",
        mimeType: picked.type || "audio/mp4",
        proxied: shouldProxy,
        preservesYouTubeTimeline: true,
      };
    })
  );
}

/**
 * SOURCE 1D: Cobalt API (audio-only MP3 extractor)
 */
async function extractFromCobalt(videoId: string): Promise<AudioStreamResult> {
  const res = await fetch("https://api.cobalt.tools/", {
    method: "POST",
    signal: createTimeoutSignal(RACE_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "HnBeeMusic/1.0",
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
  const data = (await res.json()) as { status?: string; url?: string };
  if (!data.url) throw new Error("cobalt no url");

  return {
    streamUrl: data.url,
    rawUrl: data.url,
    provider: "cobalt",
    mimeType: "audio/mpeg",
    proxied: false,
    preservesYouTubeTimeline: true,
  };
}

/**
 * SOURCE 2: SoundCloud Direct Progressive MP3 / iOS-native HLS Stream (rejects 30s Go+ snippets)
 */
async function extractFromSoundCloud(
  title: string,
  artist: string,
  expectedDuration: number,
  scUrl?: string,
  scClientId?: string
): Promise<AudioStreamResult> {
  if (scUrl && /soundcloud\.com/i.test(scUrl)) {
    const resolved = await resolveSoundCloudStream(scUrl, scClientId);
    if (!resolved.isSnippet && resolved.streamUrl && resolved.streamType !== "widget") {
      return {
        streamUrl: resolved.streamUrl,
        rawUrl: resolved.streamUrl,
        provider: `soundcloud-${resolved.streamType}`,
        mimeType:
          resolved.streamType === "hls"
            ? "application/vnd.apple.mpegurl"
            : "audio/mpeg",
        proxied: false,
        preservesYouTubeTimeline: false,
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
  const seenUrls = new Set<string>();
  const candidates = settled
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((c) => {
      if (!c.sourceUrl || seenUrls.has(c.sourceUrl)) return false;
      seenUrls.add(c.sourceUrl);
      return true;
    });

  // Strict Title & Artist scoring — NEVER match unrelated tracks! Only accept score > 0.
  const scoredCandidates = candidates
    .filter((c) => !c.isSnippet && (c.duration === 0 || c.duration > 45))
    .map((c) => ({
      track: c,
      score: scoreCandidate(
        { title: c.title, artist: c.artist, duration: c.duration },
        { title, artist, duration: expectedDuration }
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const { track: cand, score } of scoredCandidates.slice(0, 2)) {
    const resolved = await resolveSoundCloudStream(cand.sourceUrl, scClientId);
    if (resolved.isSnippet) continue;
    if (resolved.streamUrl && resolved.streamType !== "widget") {
      console.log(
        `[StreamMatch] AudioStream(SC): "${title} - ${artist}" -> Matched: "${cand.title}" (ID: ${cand.id}, Score: ${score})`
      );
      return {
        streamUrl: resolved.streamUrl,
        rawUrl: resolved.streamUrl,
        provider: `soundcloud-${resolved.streamType}`,
        mimeType:
          resolved.streamType === "hls"
            ? "application/vnd.apple.mpegurl"
            : "audio/mpeg",
        proxied: false,
        preservesYouTubeTimeline: false,
      };
    }
  }

  throw new Error("soundcloud no verified full stream");
}

/**
 * SOURCE 3: Secondary Audio Fallback — Audius Open Direct MP3 Stream + YouTube InnerTube MWEB Fallback
 */
async function extractFromSecondaryFallback(
  videoId: string,
  title: string,
  artist: string,
  expectedDuration: number
): Promise<AudioStreamResult> {
  const attempts: Array<Promise<AudioStreamResult>> = [];

  // 3A. Audius direct MP3 stream (zero ads, Range 206 supported natively)
  if (title) {
    attempts.push(
      (async () => {
        const q = encodeURIComponent(`${title} ${artist}`.trim());
        const res = await fetch(
          `https://discoveryprovider.audius.co/v1/tracks/search?query=${q}&app_name=HnBeeMusic`,
          {
            signal: createTimeoutSignal(RACE_TIMEOUT_MS),
            headers: { Accept: "application/json" },
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
        const scoredAudius = (data.data ?? [])
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
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score);

        const bestAudius = scoredAudius[0];
        if (!bestAudius?.item?.id) throw new Error("audius no verified match");
        console.log(
          `[StreamMatch] AudioStream(Audius): "${title} - ${artist}" -> Matched: "${bestAudius.item.title}" (ID: audius:${bestAudius.item.id}, Score: ${bestAudius.score})`
        );
        const directUrl = `https://discoveryprovider.audius.co/v1/tracks/${bestAudius.item.id}/stream?app_name=HnBeeMusic`;
        return {
          streamUrl: directUrl,
          rawUrl: directUrl,
          provider: "audius",
          mimeType: "audio/mpeg",
          proxied: false,
          preservesYouTubeTimeline: false,
        };
      })()
    );
  }

  // 3B. Secondary InnerTube iOS alternate client version (resilience if primary version is throttled)
  if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    attempts.push(
      (async () => {
        const res = await fetch(
          "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
          {
            method: "POST",
            signal: createTimeoutSignal(RACE_TIMEOUT_MS),
            headers: {
              "Content-Type": "application/json",
              "User-Agent":
                "com.google.ios.youtube/19.45.4 (iPhone15,3; U; CPU iOS 17_7 like Mac OS X;)",
              "X-YouTube-Client-Name": "5",
              "X-YouTube-Client-Version": "19.45.4",
            },
            body: JSON.stringify({
              videoId,
              contentCheckOk: true,
              racyCheckOk: true,
              context: {
                client: {
                  clientName: "IOS",
                  clientVersion: "19.45.4",
                  deviceMake: "Apple",
                  deviceModel: "iPhone15,3",
                  osName: "iPhone",
                  osVersion: "17.7.0.21H16",
                  hl: "en",
                  gl: "US",
                },
              },
            }),
            cache: "no-store",
          }
        );
        if (!res.ok) throw new Error(`innertube-ios-alt HTTP ${res.status}`);
        const data = (await res.json()) as {
          streamingData?: {
            adaptiveFormats?: Array<{
              url?: string;
              mimeType?: string;
              bitrate?: number;
            }>;
          };
        };
        const m4a = (data.streamingData?.adaptiveFormats ?? [])
          .filter((f) => Boolean(f.url) && /^audio\/mp4/i.test(f.mimeType || ""))
          .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        if (!m4a[0]?.url) throw new Error("innertube-ios-alt no m4a");
        const probe = await fetch(m4a[0].url, {
          headers: {
            Range: "bytes=1500000-1500001",
            "User-Agent": IOS_YOUTUBE_UA,
          },
          signal: createTimeoutSignal(1500),
          cache: "no-store",
        });
        try {
          await probe.body?.cancel();
        } catch {}
        if (probe.status !== 200 && probe.status !== 206) {
          throw new Error(`innertube-ios-alt probe HTTP ${probe.status}`);
        }
        return {
          streamUrl: wrapWithProxy(m4a[0].url),
          rawUrl: m4a[0].url,
          provider: "innertube-ios-alt",
          mimeType: "audio/mp4",
          proxied: true,
          preservesYouTubeTimeline: true,
        };
      })()
    );
  }

  if (attempts.length === 0) {
    throw new Error("no secondary fallback candidates");
  }
  return Promise.any(attempts);
}

/**
 * Dedicated iOS Direct Audio-Only Stream Resolver (`/api/audio-stream`)
 * Races 3 independent direct audio sources in parallel (Promise.any, 3.5s timeout):
 * 1. Exact YouTube `id` audio-only (.m4a/.mp3) via InnerTube iOS / Piped / Invidious / Cobalt (auto-proxied via /api/proxy-audio)
 * 2. Verified SoundCloud progressive MP3 / iOS-native HLS stream (30s snippets rejected)
 * 3. Secondary audio fallback (Audius direct MP3 / alternate InnerTube iOS client)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get("id") || searchParams.get("v") || "").trim();
  const title = (searchParams.get("title") || "").trim();
  const artist = (searchParams.get("artist") || "").trim();
  const expectedDuration = Number(searchParams.get("duration") || "0") || 0;
  const scUrl = (searchParams.get("scUrl") || "").trim() || undefined;
  const scClientId =
    request.headers.get("x-soundcloud-client-id")?.trim() || undefined;

  const hasValidVideoId = /^[a-zA-Z0-9_-]{11}$/.test(videoId);
  if (!hasValidVideoId && !title && !scUrl) {
    return NextResponse.json(
      { error: "Cần truyền tham số id (YouTube), scUrl hoặc title." },
      { status: 400 }
    );
  }

  try {
    const racers: Array<Promise<AudioStreamResult>> = [];

    // Source 1: Direct full-length audio-only from exact YouTube videoId (verified past 1MB wall)
    if (hasValidVideoId) {
      racers.push(
        Promise.any([
          extractFromInnerTubeIOS(videoId, true),
          extractFromPiped(videoId),
          extractFromInvidious(videoId),
          extractFromCobalt(videoId),
        ])
      );
    }

    // Source 2: Verified full-length SoundCloud progressive MP3 / AAC-160k HLS (zero 1MB limit!)
    if (scUrl || title) {
      racers.push(
        extractFromSoundCloud(
          title,
          artist,
          expectedDuration,
          scUrl,
          scClientId
        )
      );
    }

    // Source 3: Secondary direct audio fallback (Audius MP3 / alt InnerTube iOS)
    racers.push(
      extractFromSecondaryFallback(
        videoId,
        title,
        artist,
        expectedDuration
      )
    );

    const winner = await Promise.any(racers);

    return NextResponse.json(
      {
        streamUrl: winner.streamUrl,
        provider: winner.provider,
        mimeType: winner.mimeType,
        proxied: winner.proxied,
        preservesYouTubeTimeline: winner.preservesYouTubeTimeline,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    console.warn("[api/audio-stream] all 3 sources failed:", error);
    return NextResponse.json(
      {
        streamUrl: null,
        error: "Không tìm thấy luồng âm thanh trực tiếp khả dụng.",
      },
      { status: 404 }
    );
  }
}
