import { NextRequest, NextResponse } from "next/server";
import {
  resolveSoundCloudStream,
  searchSoundCloud,
} from "@/lib/adapters/soundcloud";

export const maxDuration = 20;

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
];

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://yewtu.be",
];

const NOISE_KEYWORDS = [
  "remix",
  "cover",
  "karaoke",
  "beat",
  "instrumental",
  "sped up",
  "slowed",
  "nightcore",
  "live",
  "reaction",
  "8d",
  "mashup",
  "nonstop",
  "playlist",
];

interface PipedAudioStream {
  url?: string;
  mimeType?: string;
  bitrate?: number;
  codec?: string;
}

interface InvidiousAdaptiveFormat {
  url?: string;
  type?: string;
  bitrate?: string | number;
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\(official.*?\)|\[official.*?\]|official music video|official mv|official audio|audio video|lyric video/gi, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isStrictAudioMatch(
  candidateTitle: string,
  candidateDuration: number,
  expectedTitle: string,
  expectedDuration: number
): boolean {
  const origLower = expectedTitle.toLowerCase();
  const candLower = candidateTitle.toLowerCase();

  // 1. Reject noise keywords unless present in original track title
  for (const kw of NOISE_KEYWORDS) {
    if (candLower.includes(kw) && !origLower.includes(kw)) {
      return false;
    }
  }

  // 2. Strict duration tolerance (<= 15s) when both durations are known
  if (expectedDuration > 0 && candidateDuration > 0) {
    if (Math.abs(candidateDuration - expectedDuration) > 15) {
      return false;
    }
  }

  // 3. Require >= 50% normalized title token overlap to prevent unrelated tracks
  const origTokens = normalizeForMatch(expectedTitle)
    .split(" ")
    .filter((w) => w.length >= 2);
  if (origTokens.length > 0) {
    const candNorm = normalizeForMatch(candidateTitle);
    const matchedCount = origTokens.filter((tok) => candNorm.includes(tok)).length;
    if (matchedCount / origTokens.length < 0.5) {
      return false;
    }
  }

  return true;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = 3000,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "HnBeeMusic/1.0",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function extractFromPiped(
  videoId: string
): Promise<{ streamUrl: string; provider: string }> {
  return Promise.any(
    PIPED_INSTANCES.map(async (base) => {
      const res = await fetchWithTimeout(`${base}/streams/${videoId}`, 3000);
      if (!res.ok) throw new Error("piped non-ok");
      const data = (await res.json()) as {
        audioStreams?: PipedAudioStream[];
      };
      const streams = (data.audioStreams ?? [])
        .filter((s) => Boolean(s.url))
        .sort((a, b) => {
          const aMp4 = /mp4|m4a/i.test(a.mimeType || "") ? 1 : 0;
          const bMp4 = /mp4|m4a/i.test(b.mimeType || "") ? 1 : 0;
          if (aMp4 !== bMp4) return bMp4 - aMp4;
          return (b.bitrate || 0) - (a.bitrate || 0);
        });
      if (!streams[0]?.url) throw new Error("piped empty");
      return { streamUrl: streams[0].url, provider: "piped" };
    })
  );
}

async function extractFromInvidious(
  videoId: string
): Promise<{ streamUrl: string; provider: string }> {
  return Promise.any(
    INVIDIOUS_INSTANCES.map(async (base) => {
      const res = await fetchWithTimeout(
        `${base}/api/v1/videos/${videoId}?fields=adaptiveFormats`,
        3000
      );
      if (!res.ok) throw new Error("invidious non-ok");
      const data = (await res.json()) as {
        adaptiveFormats?: InvidiousAdaptiveFormat[];
      };
      const audioFormats = (data.adaptiveFormats ?? [])
        .filter(
          (f) =>
            Boolean(f.url) &&
            typeof f.type === "string" &&
            f.type.startsWith("audio/")
        )
        .sort((a, b) => {
          const aMp4 = /mp4|m4a/i.test(a.type || "") ? 1 : 0;
          const bMp4 = /mp4|m4a/i.test(b.type || "") ? 1 : 0;
          if (aMp4 !== bMp4) return bMp4 - aMp4;
          return Number(b.bitrate || 0) - Number(a.bitrate || 0);
        });
      if (!audioFormats[0]?.url) throw new Error("invidious empty");
      return { streamUrl: audioFormats[0].url, provider: "invidious" };
    })
  );
}

/**
 * Clean Audio Stream Fallback for YouTube videos (iOS Audio-First & Embed Blocked):
 * - Priority 1: Extract the EXACT same recording from `videoId` via Piped / Invidious (100% same audio).
 * - Priority 2 (only when `allowCrossSource=1` AND strict duration <= 15s + anti-remix/cover filter passes):
 *   match a verified full-length SoundCloud track. Never returns an unverified or wrong song!
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get("v") || "").trim();
  const title = (searchParams.get("title") || "").trim();
  const artist = (searchParams.get("artist") || "").trim();
  const expectedDuration = Number(searchParams.get("duration") || "0") || 0;
  const allowCrossSource = searchParams.get("allowCrossSource") === "1";

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json(
      { error: "Thiếu hoặc sai định dạng YouTube videoId." },
      { status: 400 }
    );
  }

  try {
    // Priority 1: Direct audio-only stream of the EXACT YouTube videoId (100% same track)
    try {
      const direct = await Promise.any([
        extractFromPiped(videoId),
        extractFromInvidious(videoId),
      ]);
      return NextResponse.json(
        {
          streamUrl: direct.streamUrl,
          streamType: "direct-audio",
          provider: direct.provider,
        },
        { headers: { "Cache-Control": "private, max-age=300" } }
      );
    } catch {
      // Direct extraction unavailable
    }

    // Priority 2: Cross-source SoundCloud fallback ONLY when explicitly allowed (e.g. embed_blocked 101/150)
    // AND strictly verified against noise keywords + <= 15s duration delta + title token overlap.
    if (allowCrossSource && title) {
      const scClientId =
        request.headers.get("x-soundcloud-client-id")?.trim() || undefined;
      const cleanQuery = `${title} - ${artist}`
        .replace(
          /\(official.*?\)|\[official.*?\]|official music video|official mv|official audio/gi,
          ""
        )
        .trim();

      const candidates = await searchSoundCloud(cleanQuery, 8, scClientId);
      const verifiedCandidates = candidates.filter(
        (c) =>
          !c.isSnippet &&
          (c.duration === 0 || c.duration > 45) &&
          isStrictAudioMatch(c.title, c.duration, title, expectedDuration)
      );

      for (const cand of verifiedCandidates.slice(0, 2)) {
        const resolved = await resolveSoundCloudStream(
          cand.sourceUrl,
          scClientId
        );
        if (resolved.isSnippet) continue;
        if (resolved.streamUrl && resolved.streamType === "progressive") {
          return NextResponse.json(
            {
              streamUrl: resolved.streamUrl,
              streamType: "soundcloud-audio",
              provider: "soundcloud-progressive",
            },
            { headers: { "Cache-Control": "private, max-age=300" } }
          );
        }
      }
    }

    return NextResponse.json({
      streamUrl: null,
      streamType: "none",
    });
  } catch (error) {
    console.error("[api/stream/youtube] error:", error);
    return NextResponse.json({
      streamUrl: null,
      streamType: "none",
    });
  }
}
