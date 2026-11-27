import { BaseAdapter } from "@/adapters/base.adapter";
import type { StreamData, UnifiedTrack } from "@/types/audio";

const APPLE_MUSICKIT_BASE = "https://api.music.apple.com/v1";
const ITUNES_API_BASE = "https://itunes.apple.com";
const DEFAULT_STOREFRONT = "vn";
const APPLE_STREAM_TTL_MS = 30 * 60 * 1000;

interface AppleMusicArtwork {
  url?: string;
}

interface AppleMusicPreview {
  url?: string;
}

interface AppleMusicSongAttributes {
  name?: string;
  artistName?: string;
  albumName?: string;
  durationInMillis?: number;
  url?: string;
  artwork?: AppleMusicArtwork;
  previews?: AppleMusicPreview[];
}

interface AppleMusicSongResource {
  id?: string;
  attributes?: AppleMusicSongAttributes;
}

interface AppleMusicSearchResponse {
  results?: {
    songs?: {
      data?: AppleMusicSongResource[];
    };
  };
}

interface AppleMusicCatalogResponse {
  data?: AppleMusicSongResource[];
}

interface ITunesTrackItem {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
  trackTimeMillis?: number;
  previewUrl?: string;
  trackViewUrl?: string;
  isStreamable?: boolean;
}

interface ITunesSearchResponse {
  resultCount?: number;
  results?: ITunesTrackItem[];
}

/**
 * Apple Music Audio Adapter:
 * - Uses Apple MusicKit API v1 when `APPLE_MUSIC_DEVELOPER_TOKEN` is configured,
 *   with automatic fallback to Apple's public iTunes Search / Lookup API.
 * - Flags `requiresSdk: true` because full Apple Music streams are FairPlay DRM-protected
 *   and require MusicKit JS SDK; returns official AAC preview URL when available.
 */
export class AppleMusicAdapter extends BaseAdapter {
  public readonly source = "apple_music" as const;

  private getDeveloperToken(): string | null {
    return process.env.APPLE_MUSIC_DEVELOPER_TOKEN?.trim() || null;
  }

  private getStorefront(): string {
    return (
      process.env.APPLE_MUSIC_STOREFRONT?.trim().toLowerCase() ||
      DEFAULT_STOREFRONT
    );
  }

  private formatArtworkUrl(template?: string): string {
    if (!template) return "";
    return template
      .replace("{w}", "600")
      .replace("{h}", "600")
      .replace(/100x100bb/i, "600x600bb");
  }

  private mapMusicKitResource(
    resource: AppleMusicSongResource
  ): UnifiedTrack | null {
    const id = resource.id?.trim();
    const attrs = resource.attributes;
    if (!id || !attrs?.name) return null;

    const artists = (attrs.artistName || "Unknown Artist")
      .split(/,|&|feat\.|ft\./i)
      .map((name) => name.trim())
      .filter(Boolean);

    return this.createUnifiedTrack({
      id,
      title: attrs.name.trim(),
      artists: artists.length > 0 ? artists : ["Unknown Artist"],
      thumbnail: this.formatArtworkUrl(attrs.artwork?.url),
      duration:
        typeof attrs.durationInMillis === "number"
          ? Math.round(attrs.durationInMillis / 1000)
          : 0,
      isStreamable: true,
      requiresSdk: true,
      album: attrs.albumName,
      sourceUrl: attrs.url || `https://music.apple.com/song/${id}`,
    });
  }

  private mapITunesItem(item: ITunesTrackItem): UnifiedTrack | null {
    if (!item.trackId || !item.trackName) return null;
    const id = String(item.trackId);
    const artists = (item.artistName || "Unknown Artist")
      .split(/,|&|feat\.|ft\./i)
      .map((name) => name.trim())
      .filter(Boolean);

    return this.createUnifiedTrack({
      id,
      title: item.trackName.trim(),
      artists: artists.length > 0 ? artists : ["Unknown Artist"],
      thumbnail: this.formatArtworkUrl(item.artworkUrl100 || item.artworkUrl60),
      duration:
        typeof item.trackTimeMillis === "number"
          ? Math.round(item.trackTimeMillis / 1000)
          : 0,
      isStreamable: item.isStreamable !== false,
      requiresSdk: true,
      album: item.collectionName,
      sourceUrl: item.trackViewUrl || `https://music.apple.com/song/${id}`,
    });
  }

  public async search(query: string, limit: number = 10): Promise<UnifiedTrack[]> {
    return this.safeExecute("search", [], async () => {
      const trimmed = query.trim();
      if (!trimmed) return [];

      const devToken = this.getDeveloperToken();
      const storefront = this.getStorefront();

      if (devToken) {
        const params = new URLSearchParams({
          term: trimmed,
          types: "songs",
          limit: String(Math.min(limit, 25)),
        });
        const mkRes = await this.fetchJson<AppleMusicSearchResponse>(
          `${APPLE_MUSICKIT_BASE}/catalog/${storefront}/search?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${devToken}`,
            },
          }
        );
        const songs = mkRes?.results?.songs?.data ?? [];
        if (songs.length > 0) {
          return songs
            .map((item) => this.mapMusicKitResource(item))
            .filter((t): t is UnifiedTrack => Boolean(t))
            .slice(0, limit);
        }
      }

      // Public Apple iTunes Catalog Search fallback (zero-key metadata + AAC preview)
      const itunesParams = new URLSearchParams({
        term: trimmed,
        media: "music",
        entity: "song",
        country: storefront.toUpperCase(),
        limit: String(Math.min(limit, 25)),
      });
      const itunesRes = await this.fetchJson<ITunesSearchResponse>(
        `${ITUNES_API_BASE}/search?${itunesParams.toString()}`
      );
      const items = itunesRes?.results ?? [];

      return items
        .map((item) => this.mapITunesItem(item))
        .filter((t): t is UnifiedTrack => Boolean(t))
        .slice(0, limit);
    });
  }

  public async getTrackInfo(id: string): Promise<UnifiedTrack | null> {
    return this.safeExecute("getTrackInfo", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      const devToken = this.getDeveloperToken();
      const storefront = this.getStorefront();

      if (devToken) {
        const mkRes = await this.fetchJson<AppleMusicCatalogResponse>(
          `${APPLE_MUSICKIT_BASE}/catalog/${storefront}/songs/${encodeURIComponent(cleanId)}`,
          { headers: { Authorization: `Bearer ${devToken}` } }
        );
        const first = mkRes?.data?.[0];
        if (first) return this.mapMusicKitResource(first);
      }

      const lookupRes = await this.fetchJson<ITunesSearchResponse>(
        `${ITUNES_API_BASE}/lookup?id=${encodeURIComponent(cleanId)}&entity=song`
      );
      const first = lookupRes?.results?.[0];
      return first ? this.mapITunesItem(first) : null;
    });
  }

  public async getStreamUrl(id: string): Promise<StreamData | null> {
    return this.safeExecute("getStreamUrl", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      const devToken = this.getDeveloperToken();
      const storefront = this.getStorefront();
      let previewUrl = "";

      if (devToken) {
        const mkRes = await this.fetchJson<AppleMusicCatalogResponse>(
          `${APPLE_MUSICKIT_BASE}/catalog/${storefront}/songs/${encodeURIComponent(cleanId)}`,
          { headers: { Authorization: `Bearer ${devToken}` } }
        );
        previewUrl = mkRes?.data?.[0]?.attributes?.previews?.[0]?.url || "";
      }

      if (!previewUrl) {
        const lookupRes = await this.fetchJson<ITunesSearchResponse>(
          `${ITUNES_API_BASE}/lookup?id=${encodeURIComponent(cleanId)}&entity=song`
        );
        previewUrl = lookupRes?.results?.[0]?.previewUrl || "";
      }

      return {
        url: previewUrl,
        quality: "128kbps",
        expiresAt: Date.now() + APPLE_STREAM_TTL_MS,
        mimeType: "audio/mp4",
        requiresSdk: true,
        sdkUri: `apple_music:song:${cleanId}`,
      };
    });
  }
}
