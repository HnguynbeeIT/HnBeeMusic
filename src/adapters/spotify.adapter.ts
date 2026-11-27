import { BaseAdapter } from "@/adapters/base.adapter";
import type { StreamData, UnifiedTrack } from "@/types/audio";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_EMBED_BASE = "https://open.spotify.com/embed/track";
const SPOTIFY_STREAM_TTL_MS = 30 * 60 * 1000;

interface SpotifyTokenPayload {
  access_token?: string;
  expires_in?: number;
}

interface SpotifyImage {
  url?: string;
}

interface SpotifyArtist {
  name?: string;
}

interface SpotifyTrackPayload {
  id?: string;
  name?: string;
  duration_ms?: number;
  preview_url?: string | null;
  uri?: string;
  is_playable?: boolean;
  external_urls?: { spotify?: string };
  artists?: SpotifyArtist[];
  album?: {
    name?: string;
    images?: SpotifyImage[];
  };
}

interface SpotifySearchResponse {
  tracks?: {
    items?: SpotifyTrackPayload[];
  };
}

interface SpotifyEmbedNextData {
  props?: {
    pageProps?: {
      state?: {
        data?: {
          entity?: {
            id?: string;
            name?: string;
            title?: string;
            duration?: number;
            audioPreview?: { url?: string };
            artists?: Array<{ name?: string }>;
            visualIdentity?: { image?: Array<{ url?: string }> };
            coverArt?: { sources?: Array<{ url?: string }> };
          };
        };
      };
    };
  };
}

/**
 * Spotify Audio Adapter:
 * - Authenticates via OAuth2 Client Credentials (`SPOTIFY_CLIENT_ID` & `SPOTIFY_CLIENT_SECRET`)
 *   with automatic token caching and zero-key Embed `__NEXT_DATA__` fallback for `getTrackInfo`.
 * - Flags `requiresSdk: true` because full Spotify streams require Spotify Web Playback SDK (Widevine DRM).
 */
export class SpotifyAdapter extends BaseAdapter {
  public readonly source = "spotify" as const;
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  private async getAccessToken(): Promise<string | null> {
    const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) return null;

    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiresAt - 60_000) {
      return this.cachedToken;
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64"
    );
    const body = new URLSearchParams({ grant_type: "client_credentials" });

    const tokenRes = await this.fetchJson<SpotifyTokenPayload>(
      SPOTIFY_TOKEN_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );

    if (!tokenRes?.access_token) return null;
    this.cachedToken = tokenRes.access_token;
    const ttlMs = (tokenRes.expires_in ?? 3600) * 1000;
    this.tokenExpiresAt = now + ttlMs;
    return this.cachedToken;
  }

  private mapTrackPayload(track: SpotifyTrackPayload): UnifiedTrack | null {
    const id = track.id?.trim();
    const title = track.name?.trim();
    if (!id || !title) return null;

    const artists = (track.artists ?? [])
      .map((artist) => artist.name?.trim())
      .filter((name): name is string => Boolean(name));

    return this.createUnifiedTrack({
      id,
      title,
      artists: artists.length > 0 ? artists : ["Unknown Artist"],
      thumbnail: track.album?.images?.[0]?.url || "",
      duration:
        typeof track.duration_ms === "number"
          ? Math.round(track.duration_ms / 1000)
          : 0,
      isStreamable: track.is_playable !== false,
      requiresSdk: true,
      album: track.album?.name,
      sourceUrl:
        track.external_urls?.spotify || `https://open.spotify.com/track/${id}`,
    });
  }

  private async fetchEmbedEntity(
    id: string
  ): Promise<
    NonNullable<
      NonNullable<
        NonNullable<
          NonNullable<
            NonNullable<SpotifyEmbedNextData["props"]>["pageProps"]
          >["state"]
        >["data"]
      >["entity"]
    > | null
  > {
    const html = await this.fetchText(
      `${SPOTIFY_EMBED_BASE}/${encodeURIComponent(id)}`,
      { headers: { Accept: "text/html" } }
    );
    if (!html) return null;

    const match = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );
    if (!match?.[1]) return null;

    try {
      const parsed = JSON.parse(match[1]) as SpotifyEmbedNextData;
      return parsed.props?.pageProps?.state?.data?.entity ?? null;
    } catch {
      return null;
    }
  }

  public async search(query: string, limit: number = 10): Promise<UnifiedTrack[]> {
    return this.safeExecute("search", [], async () => {
      const trimmed = query.trim();
      if (!trimmed) return [];

      const token = await this.getAccessToken();
      if (!token) return [];

      const params = new URLSearchParams({
        q: trimmed,
        type: "track",
        market: "VN",
        limit: String(Math.min(limit, 25)),
      });

      const res = await this.fetchJson<SpotifySearchResponse>(
        `${SPOTIFY_API_BASE}/search?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return (res?.tracks?.items ?? [])
        .map((item) => this.mapTrackPayload(item))
        .filter((t): t is UnifiedTrack => Boolean(t))
        .slice(0, limit);
    });
  }

  public async getTrackInfo(id: string): Promise<UnifiedTrack | null> {
    return this.safeExecute("getTrackInfo", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      const token = await this.getAccessToken();
      if (token) {
        const track = await this.fetchJson<SpotifyTrackPayload>(
          `${SPOTIFY_API_BASE}/tracks/${encodeURIComponent(cleanId)}?market=VN`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (track) return this.mapTrackPayload(track);
      }

      // Zero-key Embed metadata fallback
      const entity = await this.fetchEmbedEntity(cleanId);
      if (!entity) return null;

      const title = (entity.title || entity.name || "").trim();
      if (!title) return null;

      const artists = (entity.artists ?? [])
        .map((a) => a.name?.trim())
        .filter((name): name is string => Boolean(name));

      const thumbnail =
        entity.visualIdentity?.image?.[0]?.url ||
        entity.coverArt?.sources?.[0]?.url ||
        "";

      return this.createUnifiedTrack({
        id: cleanId,
        title,
        artists: artists.length > 0 ? artists : ["Unknown Artist"],
        thumbnail,
        duration:
          typeof entity.duration === "number"
            ? Math.round(entity.duration / 1000)
            : 0,
        isStreamable: true,
        requiresSdk: true,
        sourceUrl: `https://open.spotify.com/track/${cleanId}`,
      });
    });
  }

  public async getStreamUrl(id: string): Promise<StreamData | null> {
    return this.safeExecute("getStreamUrl", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      let previewUrl = "";
      const token = await this.getAccessToken();
      if (token) {
        const track = await this.fetchJson<SpotifyTrackPayload>(
          `${SPOTIFY_API_BASE}/tracks/${encodeURIComponent(cleanId)}?market=VN`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        previewUrl = track?.preview_url || "";
      }

      if (!previewUrl) {
        const entity = await this.fetchEmbedEntity(cleanId);
        previewUrl = entity?.audioPreview?.url || "";
      }

      return {
        url: previewUrl,
        quality: "128kbps",
        expiresAt: Date.now() + SPOTIFY_STREAM_TTL_MS,
        mimeType: "audio/mpeg",
        requiresSdk: true,
        sdkUri: `spotify:track:${cleanId}`,
      };
    });
  }
}
