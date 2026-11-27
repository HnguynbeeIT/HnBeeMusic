import { BaseAdapter } from "@/adapters/base.adapter";
import type { StreamData, UnifiedTrack } from "@/types/audio";

const SC_API_V2 = "https://api-v2.soundcloud.com";
const SC_WEB_URL = "https://soundcloud.com";
const SC_CLIENT_ID_TTL_MS = 60 * 60 * 1000;
const SC_STREAM_TTL_MS = 15 * 60 * 1000;

interface SoundCloudTranscoding {
  url?: string;
  preset?: string;
  format?: {
    protocol?: string;
    mime_type?: string;
  };
}

interface SoundCloudTrackPayload {
  id?: number;
  title?: string;
  duration?: number;
  artwork_url?: string | null;
  permalink_url?: string;
  streamable?: boolean;
  policy?: string;
  user?: {
    username?: string;
    avatar_url?: string;
  };
  media?: {
    transcodings?: SoundCloudTranscoding[];
  };
}

interface SoundCloudSearchResponse {
  collection?: SoundCloudTrackPayload[];
}

interface SoundCloudTranscodeResolveResponse {
  url?: string;
}

/**
 * SoundCloud Audio Adapter:
 * - Resolves and caches SoundCloud's public `client_id` automatically (or uses `SOUNDCLOUD_CLIENT_ID`).
 * - Extracts direct progressive MP3 / HLS AAC stream URLs with `expiresAt` and anti-hotlink headers.
 */
export class SoundCloudAdapter extends BaseAdapter {
  public readonly source = "soundcloud" as const;
  private cachedClientId: string | null = null;
  private clientIdExpiresAt = 0;

  private async getClientId(): Promise<string | null> {
    const envClientId = process.env.SOUNDCLOUD_CLIENT_ID?.trim();
    if (envClientId) return envClientId;

    const now = Date.now();
    if (this.cachedClientId && now < this.clientIdExpiresAt) {
      return this.cachedClientId;
    }

    const html = await this.fetchText(SC_WEB_URL, {
      headers: { Accept: "text/html" },
      retries: 0,
    });
    if (!html) return null;

    const scriptUrls = Array.from(
      html.matchAll(
        /<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g
      )
    )
      .map((match) => match[1])
      .filter((u): u is string => Boolean(u))
      .reverse()
      .slice(0, 6);

    for (const scriptUrl of scriptUrls) {
      try {
        const js = await this.fetchText(scriptUrl, { retries: 0 });
        if (!js) continue;
        const match = js.match(/client_id\s*[:=]\s*["']([a-zA-Z0-9]{20,40})["']/);
        if (match?.[1]) {
          this.cachedClientId = match[1];
          this.clientIdExpiresAt = now + SC_CLIENT_ID_TTL_MS;
          return this.cachedClientId;
        }
      } catch {
        // Try next bundle
      }
    }

    return null;
  }

  private mapTrackPayload(
    track: SoundCloudTrackPayload
  ): UnifiedTrack | null {
    if (!track.id || !track.title) return null;
    const rawThumb = track.artwork_url || track.user?.avatar_url || "";
    const thumbnail = rawThumb.replace("-large", "-t500x500");

    return this.createUnifiedTrack({
      id: String(track.id),
      title: track.title.trim(),
      artists: [track.user?.username?.trim() || "SoundCloud Artist"],
      thumbnail,
      duration:
        typeof track.duration === "number"
          ? Math.round(track.duration / 1000)
          : 0,
      isStreamable: track.streamable !== false && track.policy !== "BLOCK",
      sourceUrl: track.permalink_url || `${SC_WEB_URL}/tracks/${track.id}`,
    });
  }

  public async search(query: string, limit: number = 10): Promise<UnifiedTrack[]> {
    return this.safeExecute("search", [], async () => {
      const trimmed = query.trim();
      if (!trimmed) return [];

      const clientId = await this.getClientId();
      if (!clientId) return [];

      const params = new URLSearchParams({
        q: trimmed,
        client_id: clientId,
        limit: String(Math.min(limit, 25)),
      });

      const res = await this.fetchJson<SoundCloudSearchResponse>(
        `${SC_API_V2}/search/tracks?${params.toString()}`,
        { headers: { Origin: SC_WEB_URL, Referer: `${SC_WEB_URL}/` } }
      );

      return (res?.collection ?? [])
        .map((item) => this.mapTrackPayload(item))
        .filter((t): t is UnifiedTrack => Boolean(t))
        .slice(0, limit);
    });
  }

  public async getTrackInfo(id: string): Promise<UnifiedTrack | null> {
    return this.safeExecute("getTrackInfo", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      const clientId = await this.getClientId();
      if (!clientId) return null;

      const track = await this.fetchJson<SoundCloudTrackPayload>(
        `${SC_API_V2}/tracks/${encodeURIComponent(cleanId)}?client_id=${encodeURIComponent(clientId)}`,
        { headers: { Origin: SC_WEB_URL, Referer: `${SC_WEB_URL}/` } }
      );

      return track ? this.mapTrackPayload(track) : null;
    });
  }

  public async getStreamUrl(id: string): Promise<StreamData | null> {
    return this.safeExecute("getStreamUrl", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      const clientId = await this.getClientId();
      if (!clientId) return null;

      const track = await this.fetchJson<SoundCloudTrackPayload>(
        `${SC_API_V2}/tracks/${encodeURIComponent(cleanId)}?client_id=${encodeURIComponent(clientId)}`,
        { headers: { Origin: SC_WEB_URL, Referer: `${SC_WEB_URL}/` } }
      );

      const transcodings = track?.media?.transcodings ?? [];
      if (transcodings.length === 0) return null;

      // Prefer progressive MP3 (directly seekable with HTTP 206 Range), fall back to HLS
      const progressive = transcodings.find(
        (t) =>
          t.format?.protocol === "progressive" &&
          Boolean(t.url) &&
          !t.url?.includes("/preview/")
      );
      const hls = transcodings.find(
        (t) =>
          t.format?.protocol === "hls" &&
          Boolean(t.url) &&
          !t.url?.includes("/preview/")
      );
      const chosen = progressive ?? hls ?? transcodings[0];
      if (!chosen?.url) return null;

      const separator = chosen.url.includes("?") ? "&" : "?";
      const resolved = await this.fetchJson<SoundCloudTranscodeResolveResponse>(
        `${chosen.url}${separator}client_id=${encodeURIComponent(clientId)}`,
        { headers: { Origin: SC_WEB_URL, Referer: `${SC_WEB_URL}/` } }
      );

      if (!resolved?.url) return null;

      const isHls = chosen.format?.protocol === "hls";
      return {
        url: resolved.url,
        quality: chosen.preset?.includes("aac_160") ? "320kbps" : "128kbps",
        expiresAt: Date.now() + SC_STREAM_TTL_MS,
        headers: {
          Origin: SC_WEB_URL,
          Referer: `${SC_WEB_URL}/`,
        },
        mimeType: isHls
          ? "application/vnd.apple.mpegurl"
          : chosen.format?.mime_type || "audio/mpeg",
      };
    });
  }
}
