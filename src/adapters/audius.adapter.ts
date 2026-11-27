import { BaseAdapter } from "@/adapters/base.adapter";
import type { StreamData, UnifiedTrack } from "@/types/audio";

const AUDIUS_DISCOVERY_FALLBACKS = [
  "https://discoveryprovider.audius.co",
  "https://discoveryprovider2.audius.co",
  "https://audius-discovery-1.cultur3stake.com",
];
const AUDIUS_APP_NAME = "HnBeeMusic";
const AUDIUS_STREAM_TTL_MS = 30 * 60 * 1000;

interface AudiusArtwork {
  "1000x1000"?: string;
  "480x480"?: string;
  "150x150"?: string;
}

interface AudiusTrackPayload {
  id?: string;
  title?: string;
  duration?: number;
  permalink?: string;
  artwork?: AudiusArtwork;
  user?: {
    name?: string;
    handle?: string;
  };
}

interface AudiusListResponse<T> {
  data?: T;
}

/**
 * Audius Open Discovery Audio Adapter:
 * - Zero-OAuth electronic/indie catalog search, URL resolution, and direct MP3 streaming.
 */
export class AudiusAdapter extends BaseAdapter {
  public readonly source = "audius" as const;
  private activeHost: string = AUDIUS_DISCOVERY_FALLBACKS[0]!;

  private async requestDiscovery<T>(pathAndQuery: string): Promise<T | null> {
    const candidates = [
      this.activeHost,
      ...AUDIUS_DISCOVERY_FALLBACKS.filter((h) => h !== this.activeHost),
    ];

    for (const host of candidates) {
      try {
        const res = await this.fetchJson<AudiusListResponse<T>>(
          `${host}${pathAndQuery}`,
          { retries: 0 }
        );
        if (res?.data !== undefined) {
          this.activeHost = host;
          return res.data;
        }
      } catch {
        // Try next open Audius discovery node
      }
    }

    return null;
  }

  private mapTrack(track: AudiusTrackPayload): UnifiedTrack | null {
    const id = track.id?.trim();
    const title = track.title?.trim();
    if (!id || !title) return null;

    const artist =
      track.user?.name?.trim() || track.user?.handle?.trim() || "Audius Artist";
    const thumbnail =
      track.artwork?.["480x480"] ||
      track.artwork?.["1000x1000"] ||
      track.artwork?.["150x150"] ||
      "";

    return this.createUnifiedTrack({
      id,
      title,
      artists: [artist],
      thumbnail,
      duration:
        typeof track.duration === "number" && Number.isFinite(track.duration)
          ? Math.round(track.duration)
          : 0,
      isStreamable: true,
      sourceUrl: track.permalink
        ? `https://audius.co${track.permalink}`
        : `https://audius.co/tracks/${id}`,
    });
  }

  public async getTrending(limit: number = 12): Promise<UnifiedTrack[]> {
    return this.safeExecute("getTrending", [], async () => {
      const params = new URLSearchParams({
        limit: String(Math.min(limit, 25)),
        app_name: AUDIUS_APP_NAME,
      });
      const items = await this.requestDiscovery<AudiusTrackPayload[]>(
        `/v1/tracks/trending?${params.toString()}`
      );
      if (!Array.isArray(items)) return [];

      return items
        .map((item) => this.mapTrack(item))
        .filter((t): t is UnifiedTrack => Boolean(t))
        .slice(0, limit);
    });
  }

  public async search(query: string, limit: number = 10): Promise<UnifiedTrack[]> {
    return this.safeExecute("search", [], async () => {
      const trimmed = query.trim();
      if (!trimmed) return [];

      const params = new URLSearchParams({
        query: trimmed,
        app_name: AUDIUS_APP_NAME,
      });
      const items = await this.requestDiscovery<AudiusTrackPayload[]>(
        `/v1/tracks/search?${params.toString()}`
      );
      if (!Array.isArray(items)) return [];

      return items
        .map((item) => this.mapTrack(item))
        .filter((t): t is UnifiedTrack => Boolean(t))
        .slice(0, limit);
    });
  }

  public async getTrackInfo(id: string): Promise<UnifiedTrack | null> {
    return this.safeExecute("getTrackInfo", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      const track = await this.requestDiscovery<AudiusTrackPayload>(
        `/v1/tracks/${encodeURIComponent(cleanId)}?app_name=${AUDIUS_APP_NAME}`
      );
      return track ? this.mapTrack(track) : null;
    });
  }

  public async resolveUrl(
    url: string
  ): Promise<{ title?: string; tracks: UnifiedTrack[] } | null> {
    return this.safeExecute("resolveUrl", null, async () => {
      const params = new URLSearchParams({
        url,
        app_name: AUDIUS_APP_NAME,
      });
      const resolved = await this.requestDiscovery<
        AudiusTrackPayload & {
          playlist_name?: string;
          tracks?: AudiusTrackPayload[];
        }
      >(`/v1/resolve?${params.toString()}`);

      if (!resolved) return null;
      if (Array.isArray(resolved.tracks) && resolved.tracks.length > 0) {
        const tracks = resolved.tracks
          .map((t) => this.mapTrack(t))
          .filter((t): t is UnifiedTrack => Boolean(t));
        return {
          title: resolved.playlist_name || "Audius Playlist",
          tracks,
        };
      }

      const single = this.mapTrack(resolved);
      return single ? { title: single.title, tracks: [single] } : null;
    });
  }

  public async getStreamUrl(id: string): Promise<StreamData | null> {
    return this.safeExecute("getStreamUrl", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      return {
        url: `${this.activeHost}/v1/tracks/${encodeURIComponent(cleanId)}/stream?app_name=${AUDIUS_APP_NAME}`,
        quality: "320kbps",
        expiresAt: Date.now() + AUDIUS_STREAM_TTL_MS,
        mimeType: "audio/mpeg",
      };
    });
  }
}
