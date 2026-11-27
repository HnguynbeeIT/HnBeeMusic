import { BaseAdapter } from "@/adapters/base.adapter";
import {
  buildNctTokenSignature,
  createNctDeviceInfo,
  parseLrcContent,
} from "@/adapters/vn-crypto.helper";
import type { LyricsData, StreamData, UnifiedTrack } from "@/types/audio";

const NCT_GRAPH_BASE = "https://graph.nhaccuatui.com/v1";
const NCT_WEB_BASE = "https://www.nhaccuatui.com";
const DEFAULT_NCT_SECRET = "nct@asdgvhfhyth123456";
const NCT_STREAM_TTL_MS = 15 * 60 * 1000;
const NCT_TOKEN_FALLBACK_TTL_MS = 20 * 60 * 1000;

interface NctTokenResponse {
  code?: number;
  data?: {
    accessToken?: string;
    timeExpire?: number;
  };
}

interface NctArtistEntry {
  name?: string;
}

interface NctStreamUrlEntry {
  quality?: string;
  stream?: string;
}

interface NctSongPayload {
  key?: string;
  id?: string;
  title?: string;
  name?: string;
  artists?: NctArtistEntry[];
  artist?: string;
  thumbnail?: string;
  thumb?: string;
  duration?: string | number;
  streamUrls?: NctStreamUrlEntry[];
  url?: string;
}

interface NctSearchGraphResponse {
  code?: number;
  data?: {
    song?: NctSongPayload[];
  };
}

interface NctSongDetailResponse {
  code?: number;
  data?: NctSongPayload & {
    lyric?: string;
    lrc?: string;
  };
}

interface NctWebAjaxResponse {
  data?: {
    song?: Array<{
      name?: string;
      singer?: string;
      url?: string;
      thumb?: string;
      key?: string;
    }>;
  };
}

/**
 * NhacCuaTui (NCT) Audio Adapter:
 * - Negotiates and caches session `accessToken` via MD5-signed `/v1/commons/token`.
 * - Supports search, metadata lookup, direct MP3/M4A stream extraction (with XML fallback),
 *   and synced lyrics retrieval.
 */
export class NctAdapter extends BaseAdapter {
  public readonly source = "nct" as const;
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  private getApiSecret(): string {
    return process.env.NCT_API_SECRET?.trim() || DEFAULT_NCT_SECRET;
  }

  private async getAccessToken(): Promise<string | null> {
    const envToken = process.env.NCT_ACCESS_TOKEN?.trim();
    if (envToken) return envToken;

    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    const timestamp = String(Math.floor(now / 1000));
    const md5 = buildNctTokenSignature(timestamp, this.getApiSecret());
    const formBody = new URLSearchParams({
      deviceinfo: createNctDeviceInfo(),
      md5,
      timestamp,
    });

    try {
      const result = await this.fetchJson<NctTokenResponse>(
        `${NCT_GRAPH_BASE}/commons/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Referer: `${NCT_WEB_BASE}/`,
          },
          body: formBody,
        }
      );

      const token = result?.data?.accessToken?.trim();
      if (token) {
        this.cachedToken = token;
        const expireMs =
          typeof result?.data?.timeExpire === "number" &&
          result.data.timeExpire > now
            ? result.data.timeExpire
            : now + NCT_TOKEN_FALLBACK_TTL_MS;
        this.tokenExpiresAt = expireMs;
        return token;
      }
    } catch {
      // Web fallback endpoints remain available even if graph token fails
    }

    return null;
  }

  private parseDurationSeconds(value: string | number | undefined): number {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.round(value);
    }
    if (typeof value === "string") {
      const parts = value.trim().split(":").map((n) => Number.parseInt(n, 10));
      if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) {
        return parts[0]! * 60 + parts[1]!;
      }
      const asNum = Number.parseInt(value, 10);
      if (Number.isFinite(asNum) && asNum > 0) return asNum;
    }
    return 0;
  }

  private mapGraphSong(song: NctSongPayload): UnifiedTrack | null {
    const id = (song.key || song.id || "").trim();
    const title = (song.title || song.name || "").trim();
    if (!id || !title) return null;

    const artistsFromList = Array.isArray(song.artists)
      ? song.artists
          .map((a) => a.name?.trim())
          .filter((name): name is string => Boolean(name))
      : [];
    const artists =
      artistsFromList.length > 0
        ? artistsFromList
        : (song.artist || "Unknown Artist")
            .split(/,|&|ft\.|feat\./i)
            .map((part) => part.trim())
            .filter(Boolean);

    return this.createUnifiedTrack({
      id,
      title,
      artists: artists.length > 0 ? artists : ["Unknown Artist"],
      thumbnail: song.thumbnail || song.thumb || "",
      duration: this.parseDurationSeconds(song.duration),
      isStreamable: true,
      sourceUrl: song.url || `${NCT_WEB_BASE}/bai-hat/${id}.html`,
    });
  }

  public async search(query: string, limit: number = 10): Promise<UnifiedTrack[]> {
    return this.safeExecute("search", [], async () => {
      const trimmed = query.trim();
      if (!trimmed) return [];

      // Primary: Graph API v1 with session accessToken
      const token = await this.getAccessToken();
      if (token) {
        const params = new URLSearchParams({
          keyword: trimmed,
          pageindex: "1",
          pagesize: String(limit),
          access_token: token,
        });
        const graphRes = await this.fetchJson<NctSearchGraphResponse>(
          `${NCT_GRAPH_BASE}/search/song?${params.toString()}`,
          { headers: { Referer: `${NCT_WEB_BASE}/` } }
        );
        if (graphRes?.data?.song && graphRes.data.song.length > 0) {
          return graphRes.data.song
            .map((item) => this.mapGraphSong(item))
            .filter((t): t is UnifiedTrack => Boolean(t))
            .slice(0, limit);
        }
      }

      // Fallback: Public NCT web ajax search
      const webParams = new URLSearchParams({ q: trimmed });
      const webRes = await this.fetchJson<NctWebAjaxResponse>(
        `${NCT_WEB_BASE}/ajax/search?${webParams.toString()}`,
        {
          headers: {
            Referer: `${NCT_WEB_BASE}/`,
            "X-Requested-With": "XMLHttpRequest",
          },
        }
      );

      const webSongs = webRes?.data?.song ?? [];
      const results: UnifiedTrack[] = [];

      for (const item of webSongs) {
        const keyFromUrl = item.url?.match(/\.([A-Za-z0-9]+)\.html/i)?.[1];
        const id = (item.key || keyFromUrl || "").trim();
        const title = (item.name || "").trim();
        if (!id || !title) continue;

        const artists = (item.singer || "Unknown Artist")
          .split(/,|&/)
          .map((s) => s.trim())
          .filter(Boolean);

        results.push(
          this.createUnifiedTrack({
            id,
            title,
            artists: artists.length > 0 ? artists : ["Unknown Artist"],
            thumbnail: item.thumb || "",
            duration: 0,
            isStreamable: true,
            sourceUrl: item.url || `${NCT_WEB_BASE}/bai-hat/${id}.html`,
          })
        );
        if (results.length >= limit) break;
      }

      return results;
    });
  }

  public async getTrackInfo(id: string): Promise<UnifiedTrack | null> {
    return this.safeExecute("getTrackInfo", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      const token = await this.getAccessToken();
      if (!token) return null;

      const detail = await this.fetchJson<NctSongDetailResponse>(
        `${NCT_GRAPH_BASE}/songs/${encodeURIComponent(cleanId)}?access_token=${encodeURIComponent(token)}`,
        { headers: { Referer: `${NCT_WEB_BASE}/` } }
      );
      return detail?.data ? this.mapGraphSong(detail.data) : null;
    });
  }

  public async getStreamUrl(id: string): Promise<StreamData | null> {
    return this.safeExecute("getStreamUrl", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      const token = await this.getAccessToken();
      if (token) {
        const detail = await this.fetchJson<NctSongDetailResponse>(
          `${NCT_GRAPH_BASE}/songs/${encodeURIComponent(cleanId)}?access_token=${encodeURIComponent(token)}`,
          { headers: { Referer: `${NCT_WEB_BASE}/` } }
        );
        const streams = detail?.data?.streamUrls ?? [];
        const stream320 = streams.find(
          (s) => s.quality === "320" && s.stream?.startsWith("http")
        );
        const stream128 = streams.find(
          (s) => s.quality === "128" && s.stream?.startsWith("http")
        );
        const chosen = stream320 ?? stream128 ?? streams.find((s) => s.stream?.startsWith("http"));

        if (chosen?.stream) {
          return {
            url: chosen.stream,
            quality: chosen.quality === "320" ? "320kbps" : "128kbps",
            expiresAt: Date.now() + NCT_STREAM_TTL_MS,
            headers: {
              Referer: `${NCT_WEB_BASE}/`,
              Origin: NCT_WEB_BASE,
            },
            mimeType: chosen.stream.includes(".m4a")
              ? "audio/mp4"
              : "audio/mpeg",
          };
        }
      }

      // Fallback: Public HTML5 XML location extractor
      const xml = await this.fetchText(
        `${NCT_WEB_BASE}/flash/xml?html5=true&key1=${encodeURIComponent(cleanId)}`,
        { headers: { Referer: `${NCT_WEB_BASE}/` } }
      );
      if (!xml) return null;

      const locationMatch = xml.match(
        /<location><!\[CDATA\[(https?:\/\/[^\]]+)\]\]><\/location>/i
      );
      const directUrl = locationMatch?.[1]?.trim();
      if (!directUrl) return null;

      return {
        url: directUrl,
        quality: "128kbps",
        expiresAt: Date.now() + NCT_STREAM_TTL_MS,
        headers: {
          Referer: `${NCT_WEB_BASE}/`,
          Origin: NCT_WEB_BASE,
        },
        mimeType: directUrl.includes(".m4a") ? "audio/mp4" : "audio/mpeg",
      };
    });
  }

  public async getLyrics(id: string): Promise<LyricsData | null> {
    return this.safeExecute("getLyrics", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      const token = await this.getAccessToken();
      if (!token) return null;

      const detail = await this.fetchJson<NctSongDetailResponse>(
        `${NCT_GRAPH_BASE}/songs/${encodeURIComponent(cleanId)}?access_token=${encodeURIComponent(token)}`,
        { headers: { Referer: `${NCT_WEB_BASE}/` } }
      );
      if (!detail?.data) return null;

      if (detail.data.lrc && detail.data.lrc.startsWith("http")) {
        const lrcText = await this.fetchText(detail.data.lrc, {
          headers: { Referer: `${NCT_WEB_BASE}/` },
        });
        if (lrcText) {
          const lines = parseLrcContent(lrcText);
          return {
            synced: lines.length > 0,
            lines,
            plainText:
              lines.length > 0
                ? lines.map((l) => l.text).join("\n")
                : lrcText.trim(),
            lrcUrl: detail.data.lrc,
          };
        }
      }

      if (detail.data.lyric) {
        return {
          synced: false,
          lines: [],
          plainText: detail.data.lyric.trim(),
        };
      }

      return null;
    });
  }
}
