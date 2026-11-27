import { BaseAdapter } from "@/adapters/base.adapter";
import {
  buildZingSignature,
  parseLrcContent,
} from "@/adapters/vn-crypto.helper";
import type {
  LyricsData,
  StreamData,
  SyncedLyricLine,
  UnifiedTrack,
} from "@/types/audio";

const ZING_BASE_URL = "https://zingmp3.vn";
const ZING_AUTOCOMPLETE_URL = "https://ac.zingmp3.vn/v1/web/ac-suggestions";
const ZING_API_VERSION = "1.10.21";
const DEFAULT_ZING_API_KEY = "88265e23d4284f25963e6eedac8fbfa3";
const DEFAULT_ZING_SECRET_KEY = "2aa2d1c561e809b267f3638c4a307aab";
const ZING_STREAM_TTL_MS = 15 * 60 * 1000;
const ZING_COOKIE_TTL_MS = 30 * 60 * 1000;
const ZING_REQUEST_TIMEOUT_MS = 3500;

interface ZingArtistItem {
  name?: string;
}

interface ZingSongPayload {
  encodeId?: string;
  id?: string;
  title?: string;
  name?: string;
  artistsNames?: string;
  artists?: ZingArtistItem[];
  thumbnailM?: string;
  thumbnail?: string;
  thumb?: string;
  duration?: number | string;
  streamingStatus?: number;
  link?: string;
  album?: { title?: string };
}

interface ZingApiEnvelope<T> {
  err?: number;
  msg?: string;
  data?: T;
}

interface ZingSearchMultiData {
  songs?: ZingSongPayload[];
}

interface ZingStreamingData {
  "128"?: string;
  "320"?: string;
}

interface ZingLyricWord {
  startTime?: number;
  data?: string;
}

interface ZingLyricSentence {
  words?: ZingLyricWord[];
}

interface ZingLyricData {
  file?: string;
  sentences?: ZingLyricSentence[];
}

interface ZingAutocompleteGroup {
  type?: number;
  suggestions?: ZingSongPayload[];
}

interface ZingAutocompleteResponse {
  err?: number;
  data?: {
    items?: ZingAutocompleteGroup[];
  };
}

function isValidDirectAudioStreamUrl(candidate: unknown): candidate is string {
  if (typeof candidate !== "string") return false;
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.toUpperCase() === "VIP") return false;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  if (/\.html?(\?|$)/i.test(trimmed)) return false;
  return true;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export class ZingMp3Adapter extends BaseAdapter {
  public readonly source = "zingmp3" as const;
  private cachedCookie: string | null = null;
  private cookieExpiresAt = 0;

  constructor() {
    super(ZING_REQUEST_TIMEOUT_MS, 1);
  }

  private getApiKey(): string {
    return process.env.ZINGMP3_API_KEY?.trim() || DEFAULT_ZING_API_KEY;
  }

  private getSecretKey(): string {
    return process.env.ZINGMP3_SECRET_KEY?.trim() || DEFAULT_ZING_SECRET_KEY;
  }

  private async resolveCookie(): Promise<string> {
    const envCookie = process.env.ZINGMP3_COOKIE?.trim();
    if (envCookie) return envCookie;

    const now = Date.now();
    if (this.cachedCookie && now < this.cookieExpiresAt) {
      return this.cachedCookie;
    }

    try {
      const response = await this.fetchWithTimeout(ZING_BASE_URL, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml",
        },
        timeoutMs: 2500,
        retries: 0,
      });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        const pairs = setCookie
          .split(/,(?=[^;]+?=)/)
          .map((segment) => segment.split(";")[0]?.trim())
          .filter((pair): pair is string => Boolean(pair));
        if (pairs.length > 0) {
          this.cachedCookie = pairs.join("; ");
          this.cookieExpiresAt = now + ZING_COOKIE_TTL_MS;
          return this.cachedCookie;
        }
      }
    } catch {
      return "";
    }

    return "";
  }

  private async requestSignedApi<T>(
    apiPath: string,
    sigParams: Record<string, string>,
    extraQuery: Record<string, string> = {}
  ): Promise<T | null> {
    const ctime = String(Math.floor(Date.now() / 1000));
    const paramsToSign: Record<string, string> = {
      ...sigParams,
      ctime,
      version: ZING_API_VERSION,
    };
    const sig = buildZingSignature(apiPath, paramsToSign, this.getSecretKey());

    const query = new URLSearchParams({
      ...extraQuery,
      ...paramsToSign,
      sig,
      apiKey: this.getApiKey(),
    });

    const cookie = await this.resolveCookie();
    const headers: Record<string, string> = {
      Referer: `${ZING_BASE_URL}/`,
      Origin: ZING_BASE_URL,
    };
    if (cookie) {
      headers.Cookie = cookie;
    }

    const envelope = await this.fetchJson<ZingApiEnvelope<T>>(
      `${ZING_BASE_URL}${apiPath}?${query.toString()}`,
      { headers, timeoutMs: ZING_REQUEST_TIMEOUT_MS, retries: 0 }
    );

    if (!envelope || envelope.err !== 0 || !envelope.data) {
      return null;
    }
    return envelope.data;
  }

  private mapSongToUnifiedTrack(song: ZingSongPayload): UnifiedTrack | null {
    const id = (song.encodeId || song.id || "").trim();
    const title = (song.title || song.name || "").trim();
    if (!id || !title) return null;

    const artistsFromArray = Array.isArray(song.artists)
      ? song.artists
          .map((a) => a.name?.trim())
          .filter((name): name is string => Boolean(name))
      : [];
    const artists =
      artistsFromArray.length > 0
        ? artistsFromArray
        : (song.artistsNames || "Unknown Artist")
            .split(/,|&|feat\.|ft\./i)
            .map((part) => part.trim())
            .filter(Boolean);

    const rawDuration =
      typeof song.duration === "number"
        ? song.duration
        : Number.parseInt(String(song.duration ?? "0"), 10);
    const duration =
      Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;

    const rawThumb = song.thumbnailM || song.thumbnail || song.thumb || "";
    const thumbnail = rawThumb.startsWith("http")
      ? rawThumb
      : rawThumb
      ? `https://photo-resize-zmp3.zmdcdn.me/${rawThumb.replace(/^\/+/, "")}`
      : "";

    const hasVipCookie = Boolean(process.env.ZINGMP3_COOKIE?.trim());
    const isStreamable = song.streamingStatus !== 2 || hasVipCookie;

    return this.createUnifiedTrack({
      id,
      title,
      artists: artists.length > 0 ? artists : ["Unknown Artist"],
      thumbnail,
      duration,
      isStreamable,
      album: song.album?.title,
      sourceUrl: song.link
        ? `${ZING_BASE_URL}${song.link}`
        : `${ZING_BASE_URL}/bai-hat/${id}.html`,
    });
  }

  private async fetchHtmlMetadataFallback(
    url: string,
    id: string
  ): Promise<UnifiedTrack | null> {
    const html = await this.fetchText(url, {
      headers: { Accept: "text/html" },
      timeoutMs: 3000,
      retries: 0,
    });
    if (!html) return null;

    const ogTitle =
      html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ||
      html.match(/<title>([^<]+)<\/title>/i)?.[1] ||
      "";
    const ogImage =
      html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] ||
      "";
    if (!ogTitle) return null;

    const cleanTitle = decodeHtmlEntities(ogTitle)
      .replace(/\s*\|\s*Zing MP3.*$/i, "")
      .replace(/\s*-\s*Zing MP3.*$/i, "")
      .trim();
    const parts = cleanTitle.split(/\s+-\s+/);
    const title = parts[0]?.trim() || cleanTitle;
    const artistRaw = parts.slice(1).join(" - ").trim() || "Zing MP3 Artist";

    return this.createUnifiedTrack({
      id,
      title,
      artists: artistRaw
        .split(/,|&/)
        .map((a) => a.trim())
        .filter(Boolean),
      thumbnail: ogImage,
      duration: 0,
      isStreamable: true,
      sourceUrl: url,
    });
  }

  public async search(query: string, limit: number = 10): Promise<UnifiedTrack[]> {
    return this.safeExecute("search", [], async () => {
      const trimmed = query.trim();
      if (!trimmed) return [];

      const multi = await this.requestSignedApi<ZingSearchMultiData>(
        "/api/v2/search/multi",
        {},
        { q: trimmed }
      );
      if (multi?.songs && multi.songs.length > 0) {
        return multi.songs
          .map((song) => this.mapSongToUnifiedTrack(song))
          .filter((t): t is UnifiedTrack => Boolean(t))
          .slice(0, limit);
      }

      const acQuery = new URLSearchParams({ num: String(limit), query: trimmed });
      const ac = await this.fetchJson<ZingAutocompleteResponse>(
        `${ZING_AUTOCOMPLETE_URL}?${acQuery.toString()}`,
        {
          headers: { Referer: `${ZING_BASE_URL}/` },
          timeoutMs: 3000,
          retries: 0,
        }
      );

      const songGroup = ac?.data?.items?.find(
        (group) => group.type === 1 && Array.isArray(group.suggestions)
      );
      if (!songGroup?.suggestions) return [];

      return songGroup.suggestions
        .map((song) => this.mapSongToUnifiedTrack(song))
        .filter((t): t is UnifiedTrack => Boolean(t))
        .slice(0, limit);
    });
  }

  public async getTrackInfo(
    id: string,
    sourceUrl?: string
  ): Promise<UnifiedTrack | null> {
    return this.safeExecute("getTrackInfo", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      const song = await this.requestSignedApi<ZingSongPayload>(
        "/api/v2/page/get/song",
        { id: cleanId }
      );
      if (song) {
        const mapped = this.mapSongToUnifiedTrack(song);
        if (mapped) return mapped;
      }

      if (sourceUrl) {
        return this.fetchHtmlMetadataFallback(sourceUrl, cleanId);
      }
      return null;
    });
  }

  public async getPlaylistInfo(
    id: string
  ): Promise<{ title: string; tracks: UnifiedTrack[] } | null> {
    return this.safeExecute("getPlaylistInfo", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      const playlist = await this.requestSignedApi<{
        title?: string;
        song?: { items?: ZingSongPayload[] };
      }>("/api/v2/page/get/playlist", { id: cleanId });

      const items = playlist?.song?.items ?? [];
      if (items.length === 0) return null;

      const tracks = items
        .map((song) => this.mapSongToUnifiedTrack(song))
        .filter((t): t is UnifiedTrack => Boolean(t));

      return {
        title: playlist?.title?.trim() || "Zing MP3 Playlist",
        tracks,
      };
    });
  }

  public async getStreamUrl(id: string): Promise<StreamData | null> {
    return this.safeExecute("getStreamUrl", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      const streaming = await this.requestSignedApi<ZingStreamingData>(
        "/api/v2/song/get/streaming",
        { id: cleanId }
      );
      if (!streaming) return null;

      const url320 = isValidDirectAudioStreamUrl(streaming["320"])
        ? streaming["320"].trim()
        : null;
      const url128 = isValidDirectAudioStreamUrl(streaming["128"])
        ? streaming["128"].trim()
        : null;

      const selectedUrl = url320 ?? url128;
      if (!selectedUrl) return null;

      const cookie = await this.resolveCookie();
      const headers: Record<string, string> = {
        Referer: `${ZING_BASE_URL}/`,
        Origin: ZING_BASE_URL,
      };
      if (cookie) {
        headers.Cookie = cookie;
      }

      return {
        url: selectedUrl,
        quality: url320 ? "320kbps" : "128kbps",
        expiresAt: Date.now() + ZING_STREAM_TTL_MS,
        headers,
        mimeType: selectedUrl.includes(".m4a") ? "audio/mp4" : "audio/mpeg",
      };
    });
  }

  public async getLyrics(id: string): Promise<LyricsData | null> {
    return this.safeExecute("getLyrics", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      const lyricData = await this.requestSignedApi<ZingLyricData>(
        "/api/v2/lyric/get/lyric",
        { id: cleanId }
      );
      if (!lyricData) return null;

      if (Array.isArray(lyricData.sentences) && lyricData.sentences.length > 0) {
        const lines: SyncedLyricLine[] = lyricData.sentences
          .map((sentence) => {
            const words = sentence.words ?? [];
            const timeMs = words[0]?.startTime ?? 0;
            const text = words
              .map((word) => word.data ?? "")
              .join(" ")
              .trim();
            return { timeMs, text };
          })
          .filter((line) => Boolean(line.text));

        if (lines.length > 0) {
          return {
            synced: true,
            lines,
            plainText: lines.map((l) => l.text).join("\n"),
            lrcUrl: lyricData.file,
          };
        }
      }

      if (lyricData.file && lyricData.file.startsWith("http")) {
        const lrcRaw = await this.fetchText(lyricData.file, {
          headers: { Referer: `${ZING_BASE_URL}/` },
        });
        if (lrcRaw) {
          const parsedLines = parseLrcContent(lrcRaw);
          return {
            synced: parsedLines.length > 0,
            lines: parsedLines,
            plainText:
              parsedLines.length > 0
                ? parsedLines.map((l) => l.text).join("\n")
                : lrcRaw.trim(),
            lrcUrl: lyricData.file,
          };
        }
      }

      return null;
    });
  }
}
