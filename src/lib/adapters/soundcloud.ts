import type { UnifiedTrack } from "@/lib/audio/types";
import { upgradeThumbnail } from "@/lib/audio/normalize";
import { searchFallbackCatalog } from "./fallback-catalog";

interface SoundCloudOEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

interface SoundCloudTranscoding {
  url: string;
  format?: {
    protocol?: string;
    mime_type?: string;
  };
}

interface SoundCloudApiTrack {
  id: number;
  title: string;
  permalink_url: string;
  artwork_url?: string | null;
  duration?: number; // milliseconds
  full_duration?: number; // milliseconds
  policy?: string; // "ALLOW" | "SNIPPET" | "BLOCK" | "MONETIZE"
  monetization_model?: string;
  user?: {
    username?: string;
    avatar_url?: string;
  };
  media?: {
    transcodings?: SoundCloudTranscoding[];
  };
}

function isSoundCloudSnippet(item: SoundCloudApiTrack): boolean {
  if (item.policy && item.policy.toUpperCase() === "SNIPPET") {
    return true;
  }
  const dur = item.duration || 0;
  const fullDur = item.full_duration || 0;
  if (dur > 0 && dur <= 31_000 && fullDur > 45_000) {
    return true;
  }
  return false;
}

let cachedPublicClientId: { id: string; expiresAt: number } | null = null;
const CLIENT_ID_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Automatically extracts & caches SoundCloud's public client_id from
 * soundcloud.com frontend bundles so Open Source users don't need to register an app.
 */
export async function getSoundCloudClientId(
  override?: string
): Promise<string | null> {
  if (override?.trim()) return override.trim();
  if (process.env.SOUNDCLOUD_CLIENT_ID?.trim()) {
    return process.env.SOUNDCLOUD_CLIENT_ID.trim();
  }

  if (cachedPublicClientId && Date.now() < cachedPublicClientId.expiresAt) {
    return cachedPublicClientId.id;
  }

  try {
    const homeRes = await fetch("https://soundcloud.com", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      cache: "no-store",
    });
    if (!homeRes.ok) return null;

    const html = await homeRes.text();
    const scriptUrls = Array.from(
      html.matchAll(
        /https:\/\/a-v2\.sndcdn\.com\/assets\/[a-zA-Z0-9._-]+\.js/g
      )
    ).map((m) => m[0]);

    // The client_id usually lives in one of the last few asset bundles
    const candidates = scriptUrls.slice(-6).reverse();
    for (const scriptUrl of candidates) {
      try {
        const jsRes = await fetch(scriptUrl, { cache: "no-store" });
        if (!jsRes.ok) continue;
        const jsText = await jsRes.text();
        const match = jsText.match(/client_id["']?\s*[:=]\s*["']([a-zA-Z0-9]{24,40})["']/);
        if (match?.[1]) {
          cachedPublicClientId = {
            id: match[1],
            expiresAt: Date.now() + CLIENT_ID_TTL_MS,
          };
          return match[1];
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.error("[soundcloud-adapter] auto client_id extraction failed:", error);
  }

  return null;
}

function mapSoundCloudApiTrack(item: SoundCloudApiTrack): UnifiedTrack {
  const rawThumb = item.artwork_url || item.user?.avatar_url || "";
  const snippet = isSoundCloudSnippet(item);
  return {
    id: `sc:${item.id}`,
    title: item.title || "SoundCloud Track",
    artist: item.user?.username || "SoundCloud Artist",
    thumbnail: upgradeThumbnail(rawThumb, "soundcloud"),
    duration: Math.round((item.full_duration || item.duration || 0) / 1000),
    source: "soundcloud",
    sourceUrl: item.permalink_url,
    ...(snippet ? { isSnippet: true } : {}),
  };
}

export async function searchSoundCloud(
  query: string,
  limit = 8,
  clientIdOverride?: string
): Promise<UnifiedTrack[]> {
  if (!query.trim()) return [];

  try {
    const clientId = await getSoundCloudClientId(clientIdOverride);
    if (clientId) {
      // Request extra items so we can drop 30s Go+ SNIPPET previews and still return full tracks
      const fetchLimit = Math.min(20, Math.max(limit * 2, 12));
      const url = new URL("https://api-v2.soundcloud.com/search/tracks");
      url.searchParams.set("q", query);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("limit", String(fetchLimit));

      const res = await fetch(url.toString(), {
        next: { revalidate: 1800 },
      });

      if (res.ok) {
        const data = (await res.json()) as {
          collection?: SoundCloudApiTrack[];
        };
        const rawTracks = (data.collection ?? []).filter(
          (t) =>
            Boolean(t?.permalink_url) &&
            t.policy?.toUpperCase() !== "BLOCK"
        );

        const fullTracks = rawTracks
          .filter((t) => !isSoundCloudSnippet(t))
          .map(mapSoundCloudApiTrack);

        // Prefer full-length tracks; only include snippet tracks if zero full tracks exist
        const tracks =
          fullTracks.length > 0
            ? fullTracks.slice(0, limit)
            : rawTracks.map(mapSoundCloudApiTrack).slice(0, limit);

        if (tracks.length > 0) return tracks;
      } else if (res.status === 401 || res.status === 403) {
        // Invalidate stale auto-extracted client_id
        cachedPublicClientId = null;
      }
    }

    return searchFallbackCatalog(query, "soundcloud");
  } catch (error) {
    console.error("[soundcloud-adapter] searchSoundCloud failed:", error);
    return [];
  }
}

export async function resolveSoundCloudStream(
  trackUrl: string,
  clientIdOverride?: string
): Promise<{
  track: UnifiedTrack | null;
  streamUrl: string | null;
  streamType: "progressive" | "hls" | "widget";
  isSnippet: boolean;
}> {
  if (!trackUrl) {
    return {
      track: null,
      streamUrl: null,
      streamType: "widget",
      isSnippet: false,
    };
  }

  try {
    const clientId = await getSoundCloudClientId(clientIdOverride);
    if (clientId) {
      const resolveApiUrl = new URL("https://api-v2.soundcloud.com/resolve");
      resolveApiUrl.searchParams.set("url", trackUrl);
      resolveApiUrl.searchParams.set("client_id", clientId);

      const res = await fetch(resolveApiUrl.toString(), { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as SoundCloudApiTrack;
        const snippet = isSoundCloudSnippet(data);
        const track = mapSoundCloudApiTrack(data);
        const transcodings = data.media?.transcodings ?? [];

        // If this track is a 30s Go+ SNIPPET, signal immediately so AudioEngineManager can match a full track
        if (snippet) {
          return {
            track,
            streamUrl: null,
            streamType: "widget",
            isSnippet: true,
          };
        }

        // Prefer progressive MP3 for clean ad-free native HTML5 <audio> playback
        const progressive = transcodings.find(
          (t) => t.format?.protocol === "progressive"
        );
        const hls = transcodings.find((t) => t.format?.protocol === "hls");
        const chosen = progressive || hls;

        if (chosen?.url) {
          const streamReqUrl = new URL(chosen.url);
          streamReqUrl.searchParams.set("client_id", clientId);
          const streamRes = await fetch(streamReqUrl.toString(), {
            cache: "no-store",
          });
          if (streamRes.ok) {
            const streamJson = (await streamRes.json()) as { url?: string };
            if (streamJson.url) {
              return {
                track: { ...track, streamUrl: streamJson.url },
                streamUrl: streamJson.url,
                streamType: progressive ? "progressive" : "hls",
                isSnippet: false,
              };
            }
          }
        }

        return {
          track,
          streamUrl: null,
          streamType: "widget",
          isSnippet: false,
        };
      }
    }
  } catch (error) {
    console.error("[soundcloud-adapter] resolveSoundCloudStream failed:", error);
  }

  const fallbackTrack = await resolveSoundCloudTrack(trackUrl);
  return {
    track: fallbackTrack,
    streamUrl: null,
    streamType: "widget",
    isSnippet: false,
  };
}

export async function resolveSoundCloudTrack(
  trackUrl: string
): Promise<UnifiedTrack | null> {
  if (!trackUrl) return null;

  try {
    const oembedUrl = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(
      trackUrl
    )}`;
    const res = await fetch(oembedUrl, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as SoundCloudOEmbedResponse;
    const rawTitle = data.title || "SoundCloud Track";
    const author = data.author_name || "SoundCloud Artist";
    const cleanedTitle = rawTitle
      .replace(new RegExp(`\\s+by\\s+${author}$`, "i"), "")
      .trim();

    const slug = trackUrl
      .replace(/^https?:\/\/(www\.|m\.)?soundcloud\.com\//i, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-|-$/g, "");

    return {
      id: `sc:${slug || Date.now()}`,
      title: cleanedTitle || rawTitle,
      artist: author,
      thumbnail: upgradeThumbnail(data.thumbnail_url || "", "soundcloud"),
      duration: 0,
      source: "soundcloud",
      sourceUrl: trackUrl,
    };
  } catch (error) {
    console.error("[soundcloud-adapter] resolveSoundCloudTrack failed:", error);
    return null;
  }
}
