import type { UnifiedTrack } from "@/lib/audio/types";
import { parseISO8601Duration, upgradeThumbnail } from "@/lib/audio/normalize";
import { REGIONS, type RegionCode } from "@/lib/audio/region";

interface YouTubeSearchItem {
  id: { videoId?: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails?: {
      high?: { url: string };
      medium?: { url: string };
      default?: { url: string };
    };
  };
}

interface YouTubeVideoItem {
  id: string;
  snippet?: {
    title: string;
    channelTitle: string;
    thumbnails?: {
      maxres?: { url: string };
      high?: { url: string };
      medium?: { url: string };
      default?: { url: string };
    };
  };
  contentDetails?: {
    duration?: string;
  };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export type YouTubeSearchStatus = "api" | "fallback" | "error";

export interface YouTubeSearchResult {
  tracks: UnifiedTrack[];
  status: YouTubeSearchStatus;
}

function parseClockDuration(text?: string): number {
  if (!text) return 0;
  const parts = text
    .trim()
    .split(":")
    .map((n) => Number.parseInt(n, 10));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

const FAST_TIMEOUT_MS = 2500;
// Short-circuit Data API v3 for 30 minutes after hitting 403/429 quota exceeded
// so every track search saves 300-600ms of wasted round-trip latency.
let ytDataApiQuotaBlockedUntil = 0;

function createTimeoutSignal(ms = FAST_TIMEOUT_MS): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

const PIPED_SEARCH_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
];

const INVIDIOUS_SEARCH_INSTANCES = [
  "https://inv.nadeko.net",
  "https://yewtu.be",
];

interface InnerTubeVideoRenderer {
  videoId?: string;
  title?: { runs?: Array<{ text?: string }> };
  ownerText?: { runs?: Array<{ text?: string }> };
  longBylineText?: { runs?: Array<{ text?: string }> };
  lengthText?: { simpleText?: string };
  thumbnail?: { thumbnails?: Array<{ url?: string }> };
}

interface InnerTubeSearchPayload {
  contents?: {
    twoColumnSearchResultsRenderer?: {
      primaryContents?: {
        sectionListRenderer?: {
          contents?: Array<{
            itemSectionRenderer?: {
              contents?: Array<{
                videoRenderer?: InnerTubeVideoRenderer;
              }>;
            };
          }>;
        };
      };
    };
  };
}

function extractTracksFromInnerTubePayload(
  data: InnerTubeSearchPayload,
  maxResults: number
): UnifiedTrack[] {
  const sections =
    data.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents ?? [];

  const tracks: UnifiedTrack[] = [];
  const seen = new Set<string>();

  for (const section of sections) {
    const items = section.itemSectionRenderer?.contents ?? [];
    for (const entry of items) {
      const v = entry.videoRenderer;
      if (!v?.videoId || seen.has(v.videoId)) continue;
      seen.add(v.videoId);

      const title =
        v.title?.runs?.map((r) => r.text || "").join("").trim() ||
        "YouTube Track";
      const artist =
        v.ownerText?.runs?.[0]?.text ||
        v.longBylineText?.runs?.[0]?.text ||
        "YouTube";
      const duration = parseClockDuration(v.lengthText?.simpleText);
      const rawThumb =
        v.thumbnail?.thumbnails?.at(-1)?.url ||
        `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;

      tracks.push({
        id: `yt:${v.videoId}`,
        title: decodeHtmlEntities(title),
        artist: decodeHtmlEntities(artist),
        thumbnail: upgradeThumbnail(rawThumb, "youtube"),
        duration,
        source: "youtube",
        sourceUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
      });

      if (tracks.length >= maxResults) return tracks;
    }
  }

  return tracks;
}

/**
 * Tier 2: YouTube InnerTube JSON Search API (works reliably on Vercel Serverless IPs
 * without HTML consent-wall blocks and uses zero Data API v3 quota).
 */
async function searchYouTubeInnerTube(
  query: string,
  maxResults = 10,
  region: RegionCode = "VN"
): Promise<UnifiedTrack[]> {
  if (!query.trim()) return [];
  try {
    const regionInfo = REGIONS[region];
    const res = await fetch(
      "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
      {
        method: "POST",
        signal: createTimeoutSignal(FAST_TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Origin: "https://www.youtube.com",
          Referer: "https://www.youtube.com/",
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20240726.00.00",
              hl: regionInfo.youtubeLang || "vi",
              gl: regionInfo.youtubeRegion || "VN",
            },
          },
          query: query.trim(),
        }),
        cache: "no-store",
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as InnerTubeSearchPayload;
    return extractTracksFromInnerTubePayload(data, maxResults);
  } catch {
    return [];
  }
}

/**
 * Tier 3: Zero-Quota ytInitialData HTML Fallback (with SOCS consent cookie, strict 2.5s timeout).
 */
async function searchYouTubeZeroQuotaFallback(
  query: string,
  maxResults = 10,
  region: RegionCode = "VN"
): Promise<UnifiedTrack[]> {
  if (!query.trim()) return [];

  try {
    const regionInfo = REGIONS[region];
    const url = new URL("https://www.youtube.com/results");
    url.searchParams.set("search_query", query.trim());
    if (regionInfo.youtubeLang) {
      url.searchParams.set("hl", regionInfo.youtubeLang);
    }
    if (regionInfo.youtubeRegion) {
      url.searchParams.set("gl", regionInfo.youtubeRegion);
    }

    const res = await fetch(url.toString(), {
      signal: createTimeoutSignal(FAST_TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Cookie: "SOCS=CAI",
        "Accept-Language":
          region === "VN"
            ? "vi-VN,vi;q=0.9,en;q=0.8"
            : region === "KR"
            ? "ko-KR,ko;q=0.9,en;q=0.8"
            : region === "JP"
            ? "ja-JP,ja;q=0.9,en;q=0.8"
            : "en-US,en;q=0.9",
      },
      cache: "no-store",
    });

    if (!res.ok) return [];
    const html = await res.text();

    const marker = "var ytInitialData = ";
    const startIdx = html.indexOf(marker);
    if (startIdx === -1) return [];

    const jsonStart = startIdx + marker.length;
    const endIdx = html.indexOf(";</script>", jsonStart);
    if (endIdx === -1) return [];

    const rawJson = html.slice(jsonStart, endIdx);
    const data = JSON.parse(rawJson) as InnerTubeSearchPayload;
    return extractTracksFromInnerTubePayload(data, maxResults);
  } catch (error) {
    console.error("[youtube-adapter] zero-quota fallback failed:", error);
    return [];
  }
}

/**
 * Tier 4: Rotating Piped & Invidious Search API (strict 2.5s timeout).
 */
async function searchYouTubePipedInvidious(
  query: string,
  maxResults = 10
): Promise<UnifiedTrack[]> {
  if (!query.trim()) return [];
  const q = encodeURIComponent(query.trim());

  const pipedTasks = PIPED_SEARCH_INSTANCES.map(async (base) => {
    const res = await fetch(`${base}/search?q=${q}&filter=videos`, {
      signal: createTimeoutSignal(FAST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error("piped search non-ok");
    const data = (await res.json()) as {
      items?: Array<{
        url?: string;
        title?: string;
        uploaderName?: string;
        thumbnail?: string;
        duration?: number;
      }>;
    };
    const tracks: UnifiedTrack[] = [];
    for (const item of data.items ?? []) {
      const m = item.url?.match(/v=([a-zA-Z0-9_-]{11})/);
      const videoId = m?.[1];
      if (!videoId) continue;
      tracks.push({
        id: `yt:${videoId}`,
        title: item.title || "YouTube Track",
        artist: item.uploaderName || "YouTube",
        thumbnail: upgradeThumbnail(
          item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          "youtube"
        ),
        duration:
          typeof item.duration === "number" && item.duration > 0
            ? item.duration
            : 0,
        source: "youtube",
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      });
      if (tracks.length >= maxResults) break;
    }
    if (tracks.length === 0) throw new Error("piped search empty");
    return tracks;
  });

  const invidiousTasks = INVIDIOUS_SEARCH_INSTANCES.map(async (base) => {
    const res = await fetch(`${base}/api/v1/search?q=${q}&type=video`, {
      signal: createTimeoutSignal(FAST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error("invidious search non-ok");
    const items = (await res.json()) as Array<{
      videoId?: string;
      title?: string;
      author?: string;
      lengthSeconds?: number;
      videoThumbnails?: Array<{ url?: string }>;
    }>;
    const tracks: UnifiedTrack[] = [];
    for (const item of items ?? []) {
      if (!item.videoId) continue;
      tracks.push({
        id: `yt:${item.videoId}`,
        title: item.title || "YouTube Track",
        artist: item.author || "YouTube",
        thumbnail: upgradeThumbnail(
          item.videoThumbnails?.[0]?.url ||
            `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
          "youtube"
        ),
        duration:
          typeof item.lengthSeconds === "number" && item.lengthSeconds > 0
            ? item.lengthSeconds
            : 0,
        source: "youtube",
        sourceUrl: `https://www.youtube.com/watch?v=${item.videoId}`,
      });
      if (tracks.length >= maxResults) break;
    }
    if (tracks.length === 0) throw new Error("invidious search empty");
    return tracks;
  });

  try {
    return await Promise.any([...pipedTasks, ...invidiousTasks]);
  } catch {
    return [];
  }
}

export async function searchYouTubeWithStatus(
  query: string,
  maxResults = 8,
  apiKeyOverride?: string,
  region: RegionCode = "VN"
): Promise<YouTubeSearchResult> {
  if (!query.trim()) return { tracks: [], status: "api" };

  const apiKey = apiKeyOverride?.trim() || process.env.YOUTUBE_API_KEY;

  // Tier 1: Official YouTube Data API v3 (skip for 30m if server key hit 403/429 quota)
  const useCustomKey = Boolean(apiKeyOverride?.trim());
  if (apiKey && (useCustomKey || Date.now() >= ytDataApiQuotaBlockedUntil)) {
    try {
      const regionInfo = REGIONS[region];
      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("videoCategoryId", "10"); // Music
      searchUrl.searchParams.set("maxResults", String(maxResults));
      searchUrl.searchParams.set("q", query);
      if (regionInfo.youtubeRegion) {
        searchUrl.searchParams.set("regionCode", regionInfo.youtubeRegion);
      }
      if (regionInfo.youtubeLang) {
        searchUrl.searchParams.set("relevanceLanguage", regionInfo.youtubeLang);
      }
      searchUrl.searchParams.set("key", apiKey);

      const searchRes = await fetch(searchUrl.toString(), {
        signal: createTimeoutSignal(FAST_TIMEOUT_MS),
        next: { revalidate: 1800 },
      });

      if (searchRes.ok) {
        const searchData = (await searchRes.json()) as {
          items?: YouTubeSearchItem[];
        };
        const items = (searchData.items ?? []).filter(
          (item) => item.id?.videoId
        );
        if (items.length > 0) {
          const ids = items.map((item) => item.id.videoId!).join(",");
          const detailsUrl = new URL(
            "https://www.googleapis.com/youtube/v3/videos"
          );
          detailsUrl.searchParams.set("part", "contentDetails");
          detailsUrl.searchParams.set("id", ids);
          detailsUrl.searchParams.set("key", apiKey);

          const durationMap = new Map<string, number>();
          const detailsRes = await fetch(detailsUrl.toString(), {
            signal: createTimeoutSignal(FAST_TIMEOUT_MS),
            next: { revalidate: 1800 },
          });
          if (detailsRes.ok) {
            const detailsData = (await detailsRes.json()) as {
              items?: YouTubeVideoItem[];
            };
            for (const video of detailsData.items ?? []) {
              durationMap.set(
                video.id,
                parseISO8601Duration(video.contentDetails?.duration)
              );
            }
          }

          const tracks = items.map((item) => {
            const videoId = item.id.videoId!;
            const rawThumb =
              item.snippet.thumbnails?.high?.url ||
              item.snippet.thumbnails?.medium?.url ||
              item.snippet.thumbnails?.default?.url ||
              `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

            return {
              id: `yt:${videoId}`,
              title: decodeHtmlEntities(item.snippet.title),
              artist: decodeHtmlEntities(item.snippet.channelTitle),
              thumbnail: upgradeThumbnail(rawThumb, "youtube"),
              duration: durationMap.get(videoId) ?? 0,
              source: "youtube" as const,
              sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
            };
          });

          return { tracks, status: "api" };
        }
      } else {
        if (!useCustomKey && (searchRes.status === 403 || searchRes.status === 429)) {
          ytDataApiQuotaBlockedUntil = Date.now() + 30 * 60 * 1000;
        }
        console.warn(
          `[youtube-adapter] Data API v3 HTTP ${searchRes.status} — switching to fast-path racing`
        );
      }
    } catch (error) {
      console.error("[youtube-adapter] searchYouTube API failed:", error);
    }
  }

  // Tier 2 + 3 Fast-Path Racing: race InnerTube JSON API and ytInitialData HTML in parallel (<= 2.5s)
  try {
    const fastest = await Promise.any([
      searchYouTubeInnerTube(query, maxResults, region).then((res) => {
        if (res.length === 0) throw new Error("innertube empty");
        return res;
      }),
      searchYouTubeZeroQuotaFallback(query, maxResults, region).then((res) => {
        if (res.length === 0) throw new Error("html empty");
        return res;
      }),
    ]);
    return { tracks: fastest, status: "fallback" };
  } catch {
    // Both failed -> proceed to Tier 4
  }

  // Tier 4: Rotating Piped & Invidious Search API (<= 2.5s)
  const pipedInvidiousTracks = await searchYouTubePipedInvidious(
    query,
    maxResults
  );
  if (pipedInvidiousTracks.length > 0) {
    return { tracks: pipedInvidiousTracks, status: "fallback" };
  }

  return { tracks: [], status: "error" };
}

export async function searchYouTube(
  query: string,
  maxResults = 8,
  apiKeyOverride?: string,
  region: RegionCode = "VN"
): Promise<UnifiedTrack[]> {
  const { tracks } = await searchYouTubeWithStatus(
    query,
    maxResults,
    apiKeyOverride,
    region
  );
  return tracks;
}

export async function resolveYouTubeTrack(
  videoId: string,
  apiKeyOverride?: string
): Promise<UnifiedTrack | null> {
  if (!videoId) return null;

  const apiKey = apiKeyOverride?.trim() || process.env.YOUTUBE_API_KEY;
  if (apiKey) {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "snippet,contentDetails");
      url.searchParams.set("id", videoId);
      url.searchParams.set("key", apiKey);

      const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
      if (res.ok) {
        const data = (await res.json()) as { items?: YouTubeVideoItem[] };
        const video = data.items?.[0];
        if (video?.snippet) {
          const rawThumb =
            video.snippet.thumbnails?.maxres?.url ||
            video.snippet.thumbnails?.high?.url ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

          return {
            id: `yt:${videoId}`,
            title: decodeHtmlEntities(video.snippet.title),
            artist: decodeHtmlEntities(video.snippet.channelTitle),
            thumbnail: upgradeThumbnail(rawThumb, "youtube"),
            duration: parseISO8601Duration(video.contentDetails?.duration),
            source: "youtube",
            sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
          };
        }
      }
    } catch (error) {
      console.error("[youtube-adapter] API resolve failed:", error);
    }
  }

  // Zero-API-key fallback via official YouTube oEmbed
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`;
    const res = await fetch(oembedUrl, { next: { revalidate: 3600 } });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };

    return {
      id: `yt:${videoId}`,
      title: data.title || `YouTube Track (${videoId})`,
      artist: data.author_name || "YouTube",
      thumbnail: upgradeThumbnail(
        data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        "youtube"
      ),
      duration: 0, // Filled dynamically by YouTube IFrame Player on load
      source: "youtube",
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  } catch (error) {
    console.error("[youtube-adapter] oEmbed resolve failed:", error);
    return null;
  }
}

export async function resolveYouTubePlaylist(
  playlistId: string,
  apiKeyOverride?: string
): Promise<{ title: string; tracks: UnifiedTrack[] } | null> {
  const apiKey = apiKeyOverride?.trim() || process.env.YOUTUBE_API_KEY;
  if (!apiKey || !playlistId) return null;

  try {
    const itemsUrl = new URL(
      "https://www.googleapis.com/youtube/v3/playlistItems"
    );
    itemsUrl.searchParams.set("part", "snippet,contentDetails");
    itemsUrl.searchParams.set("playlistId", playlistId);
    itemsUrl.searchParams.set("maxResults", "25");
    itemsUrl.searchParams.set("key", apiKey);

    const res = await fetch(itemsUrl.toString(), { next: { revalidate: 1800 } });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      items?: Array<{
        snippet?: {
          title?: string;
          videoOwnerChannelTitle?: string;
          channelTitle?: string;
          thumbnails?: {
            high?: { url: string };
            medium?: { url: string };
            default?: { url: string };
          };
          resourceId?: { videoId?: string };
        };
        contentDetails?: { videoId?: string };
      }>;
    };

    const rawItems = (data.items ?? []).filter(
      (i) =>
        (i.contentDetails?.videoId || i.snippet?.resourceId?.videoId) &&
        i.snippet?.title !== "Private video" &&
        i.snippet?.title !== "Deleted video"
    );
    if (rawItems.length === 0) return null;

    const ids = rawItems
      .map((i) => i.contentDetails?.videoId || i.snippet?.resourceId?.videoId!)
      .join(",");

    const durationMap = new Map<string, number>();
    const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailsUrl.searchParams.set("part", "contentDetails");
    detailsUrl.searchParams.set("id", ids);
    detailsUrl.searchParams.set("key", apiKey);

    const detailsRes = await fetch(detailsUrl.toString(), {
      next: { revalidate: 1800 },
    });
    if (detailsRes.ok) {
      const detailsData = (await detailsRes.json()) as {
        items?: YouTubeVideoItem[];
      };
      for (const v of detailsData.items ?? []) {
        durationMap.set(v.id, parseISO8601Duration(v.contentDetails?.duration));
      }
    }

    const tracks: UnifiedTrack[] = rawItems.map((item) => {
      const videoId =
        item.contentDetails?.videoId || item.snippet?.resourceId?.videoId!;
      const rawThumb =
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.medium?.url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      return {
        id: `yt:${videoId}`,
        title: decodeHtmlEntities(item.snippet?.title || "YouTube Track"),
        artist: decodeHtmlEntities(
          item.snippet?.videoOwnerChannelTitle ||
            item.snippet?.channelTitle ||
            "YouTube"
        ),
        thumbnail: upgradeThumbnail(rawThumb, "youtube"),
        duration: durationMap.get(videoId) ?? 0,
        source: "youtube",
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    });

    return {
      title: `YouTube Playlist (${tracks.length} bài)`,
      tracks,
    };
  } catch (error) {
    console.error("[youtube-adapter] resolveYouTubePlaylist failed:", error);
    return null;
  }
}

export async function getTrendingYouTube(
  region: RegionCode = "VN",
  apiKeyOverride?: string,
  maxResults = 12
): Promise<UnifiedTrack[]> {
  const apiKey = apiKeyOverride?.trim() || process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  try {
    const regionInfo = REGIONS[region];
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("chart", "mostPopular");
    url.searchParams.set("videoCategoryId", "10"); // Music
    url.searchParams.set("maxResults", String(maxResults));
    url.searchParams.set("regionCode", regionInfo.youtubeRegion || "VN");
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString(), { next: { revalidate: 1800 } });
    if (!res.ok) return [];

    const data = (await res.json()) as { items?: YouTubeVideoItem[] };
    return (data.items ?? [])
      .filter((v) => Boolean(v.id && v.snippet))
      .map((video) => {
        const rawThumb =
          video.snippet?.thumbnails?.maxres?.url ||
          video.snippet?.thumbnails?.high?.url ||
          `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;

        return {
          id: `yt:${video.id}`,
          title: decodeHtmlEntities(video.snippet?.title || "YouTube Track"),
          artist: decodeHtmlEntities(video.snippet?.channelTitle || "YouTube"),
          thumbnail: upgradeThumbnail(rawThumb, "youtube"),
          duration: parseISO8601Duration(video.contentDetails?.duration),
          source: "youtube" as const,
          sourceUrl: `https://www.youtube.com/watch?v=${video.id}`,
        };
      });
  } catch (error) {
    console.error("[youtube-adapter] getTrendingYouTube failed:", error);
    return [];
  }
}
