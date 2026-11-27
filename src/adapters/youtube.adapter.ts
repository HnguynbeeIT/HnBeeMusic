import { ClientType, Innertube } from "youtubei.js";
import { BaseAdapter } from "@/adapters/base.adapter";
import type { StreamData, UnifiedTrack } from "@/types/audio";

const YOUTUBE_IOS_UA =
  "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)";
const YOUTUBE_DEFAULT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface YoutubeFormatLike {
  url?: string;
  mime_type?: string;
  has_audio?: boolean;
  has_video?: boolean;
  bitrate?: number;
}

interface YoutubeVideoNode {
  type?: string;
  id?: string;
  video_id?: string;
  title?: { text?: string; toString?: () => string } | string;
  author?: { name?: string };
  duration?: { seconds?: number };
  thumbnails?: Array<{ url?: string }>;
}

/**
 * YouTube Audio Adapter powered by `youtubei.js` (Innertube):
 * - Zero-quota search, metadata lookup, and direct audio-only stream extraction
 *   with accurate `expiresAt` parsed from signed YouTube stream URLs.
 */
export class YouTubeAdapter extends BaseAdapter {
  public readonly source = "youtube" as const;
  private webClientPromise: Promise<Innertube> | null = null;
  private iosClientPromise: Promise<Innertube> | null = null;

  private getWebClient(): Promise<Innertube> {
    if (!this.webClientPromise) {
      this.webClientPromise = Innertube.create({
        generate_session_locally: true,
        retrieve_player: false,
      }).catch((err: unknown) => {
        this.webClientPromise = null;
        throw err;
      });
    }
    return this.webClientPromise;
  }

  private getIosClient(): Promise<Innertube> {
    if (!this.iosClientPromise) {
      this.iosClientPromise = Innertube.create({
        client_type: ClientType.IOS,
        generate_session_locally: true,
        retrieve_player: false,
      }).catch((err: unknown) => {
        this.iosClientPromise = null;
        throw err;
      });
    }
    return this.iosClientPromise;
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`YouTube operation timed out after ${ms}ms`));
      }, ms);

      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err: unknown) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  private extractTitle(title: YoutubeVideoNode["title"]): string {
    if (typeof title === "string") return title.trim();
    if (title && typeof title.text === "string") return title.text.trim();
    if (title && typeof title.toString === "function") {
      const text = title.toString().trim();
      return text === "[object Object]" ? "" : text;
    }
    return "";
  }

  private extractExpiresAt(streamUrl: string): number {
    try {
      const parsed = new URL(streamUrl);
      const expireParam = parsed.searchParams.get("expire");
      if (expireParam) {
        const seconds = Number.parseInt(expireParam, 10);
        if (Number.isFinite(seconds) && seconds > 1_000_000_000) {
          return seconds * 1000;
        }
      }
    } catch {
      // Fall back to default TTL
    }
    return Date.now() + YOUTUBE_DEFAULT_TTL_MS;
  }

  public async search(query: string, limit: number = 10): Promise<UnifiedTrack[]> {
    return this.safeExecute("search", [], async () => {
      const trimmed = query.trim();
      if (!trimmed) return [];

      const client = await this.withTimeout(this.getWebClient(), this.timeoutMs);
      const searchResult = await this.withTimeout(
        client.search(trimmed, { type: "video" }),
        this.timeoutMs
      );

      const tracks: UnifiedTrack[] = [];
      const rawVideos = (searchResult.videos ?? []) as unknown as YoutubeVideoNode[];

      for (const item of rawVideos) {
        const id = (item.id || item.video_id || "").trim();
        const title = this.extractTitle(item.title);
        if (!id || !title) continue;

        const artist = item.author?.name?.trim() || "YouTube Artist";
        const thumbnail =
          item.thumbnails?.[0]?.url ||
          `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
        const duration =
          typeof item.duration?.seconds === "number" &&
          Number.isFinite(item.duration.seconds)
            ? item.duration.seconds
            : 0;

        tracks.push(
          this.createUnifiedTrack({
            id,
            title,
            artists: [artist],
            thumbnail,
            duration,
            isStreamable: true,
            sourceUrl: `https://www.youtube.com/watch?v=${id}`,
          })
        );
        if (tracks.length >= limit) break;
      }

      return tracks;
    });
  }

  public async getTrackInfo(id: string): Promise<UnifiedTrack | null> {
    return this.safeExecute("getTrackInfo", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      const client = await this.withTimeout(this.getIosClient(), this.timeoutMs);
      const info = await this.withTimeout(
        client.getBasicInfo(cleanId),
        this.timeoutMs
      );

      const basic = info.basic_info;
      const title = basic.title?.trim();
      if (!title) return null;

      return this.createUnifiedTrack({
        id: cleanId,
        title,
        artists: [basic.author?.trim() || "YouTube Artist"],
        thumbnail:
          basic.thumbnail?.[0]?.url ||
          `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
        duration: typeof basic.duration === "number" ? basic.duration : 0,
        isStreamable: true,
        sourceUrl: `https://www.youtube.com/watch?v=${cleanId}`,
      });
    });
  }

  public async getStreamUrl(id: string): Promise<StreamData | null> {
    return this.safeExecute("getStreamUrl", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      const client = await this.withTimeout(this.getIosClient(), this.timeoutMs);
      const info = await this.withTimeout(
        client.getBasicInfo(cleanId),
        this.timeoutMs
      );

      const streamingData = info.streaming_data;
      if (!streamingData) return null;

      const adaptiveFormats = (streamingData.adaptive_formats ??
        []) as unknown as YoutubeFormatLike[];
      const combinedFormats = (streamingData.formats ??
        []) as unknown as YoutubeFormatLike[];

      const audioOnlyFormats = adaptiveFormats
        .filter(
          (fmt) =>
            Boolean(fmt.url) &&
            (fmt.has_audio === true ||
              (fmt.mime_type?.startsWith("audio/") ?? false)) &&
            fmt.has_video !== true
        )
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

      const preferred =
        audioOnlyFormats.find((f) => f.mime_type?.includes("audio/mp4")) ??
        audioOnlyFormats[0] ??
        combinedFormats.find((f) => Boolean(f.url));

      if (preferred?.url) {
        const mimeType =
          preferred.mime_type?.split(";")[0]?.trim() || "audio/mp4";
        const bitrate = preferred.bitrate ?? 128_000;

        return {
          url: preferred.url,
          quality: bitrate >= 250_000 ? "320kbps" : "128kbps",
          expiresAt: this.extractExpiresAt(preferred.url),
          headers: {
            "User-Agent": YOUTUBE_IOS_UA,
          },
          mimeType,
        };
      }

      // HLS manifest fallback for iOS/live formats
      if (streamingData.hls_manifest_url) {
        return {
          url: streamingData.hls_manifest_url,
          quality: "128kbps",
          expiresAt: this.extractExpiresAt(streamingData.hls_manifest_url),
          headers: {
            "User-Agent": YOUTUBE_IOS_UA,
          },
          mimeType: "application/vnd.apple.mpegurl",
        };
      }

      return null;
    });
  }
}
