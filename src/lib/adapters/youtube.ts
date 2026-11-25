import type { UnifiedTrack } from "@/lib/audio/types";
import { parseISO8601Duration, upgradeThumbnail } from "@/lib/audio/normalize";

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

export async function searchYouTube(
  query: string,
  maxResults = 8,
  apiKeyOverride?: string
): Promise<UnifiedTrack[]> {
  const apiKey = apiKeyOverride?.trim() || process.env.YOUTUBE_API_KEY;
  if (!apiKey || !query.trim()) return [];

  try {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("videoCategoryId", "10"); // Music
    searchUrl.searchParams.set("maxResults", String(maxResults));
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("key", apiKey);

    const searchRes = await fetch(searchUrl.toString(), {
      next: { revalidate: 1800 },
    });
    if (!searchRes.ok) return [];

    const searchData = (await searchRes.json()) as {
      items?: YouTubeSearchItem[];
    };
    const items = (searchData.items ?? []).filter((item) => item.id?.videoId);
    if (items.length === 0) return [];

    const ids = items.map((item) => item.id.videoId!).join(",");
    const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailsUrl.searchParams.set("part", "contentDetails");
    detailsUrl.searchParams.set("id", ids);
    detailsUrl.searchParams.set("key", apiKey);

    const durationMap = new Map<string, number>();
    const detailsRes = await fetch(detailsUrl.toString(), {
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

    return items.map((item) => {
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
        source: "youtube",
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
      } satisfies UnifiedTrack;
    });
  } catch (error) {
    console.error("[youtube-adapter] searchYouTube failed:", error);
    return [];
  }
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
