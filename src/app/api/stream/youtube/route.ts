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

async function fetchWithTimeout(
  url: string,
  timeoutMs = 3500
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "HnBeeMusic/1.0",
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
 * Clean Audio Stream Fallback for YouTube videos:
 * 1. Races Piped & Invidious direct audio-only streams in parallel (<= 3s)
 * 2. Falls back to matching a clean full-length SoundCloud track (progressive MP3 or clean track URL)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = (searchParams.get("v") || "").trim();
  const title = (searchParams.get("title") || "").trim();
  const artist = (searchParams.get("artist") || "").trim();

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json(
      { error: "Thiếu hoặc sai định dạng YouTube videoId." },
      { status: 400 }
    );
  }

  try {
    // Tier 1 + 2 in parallel: Piped & Invidious direct audio streams
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
      // Proceed to Tier 3 SoundCloud clean match
    }

    // Tier 3: Clean full-length SoundCloud match (never 30s Go+ SNIPPET)
    if (title) {
      const scClientId =
        request.headers.get("x-soundcloud-client-id")?.trim() || undefined;
      const cleanQuery = `${artist} ${title}`
        .replace(
          /\(official.*?\)|\[official.*?\]|official music video|official mv|official audio/gi,
          ""
        )
        .trim();

      const candidates = await searchSoundCloud(cleanQuery, 6, scClientId);
      const fullCandidates = candidates.filter(
        (c) => !c.isSnippet && (c.duration === 0 || c.duration > 45)
      );

      let firstCleanScTrackUrl: string | null = null;
      for (const cand of fullCandidates.slice(0, 2)) {
        const resolved = await resolveSoundCloudStream(
          cand.sourceUrl,
          scClientId
        );
        if (resolved.isSnippet) continue;
        if (!firstCleanScTrackUrl) {
          firstCleanScTrackUrl = cand.sourceUrl;
        }
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

      if (firstCleanScTrackUrl) {
        return NextResponse.json(
          {
            streamUrl: firstCleanScTrackUrl,
            streamType: "soundcloud-widget",
            provider: "soundcloud-fallback",
          },
          { headers: { "Cache-Control": "private, max-age=300" } }
        );
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
