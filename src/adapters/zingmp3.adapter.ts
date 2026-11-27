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

/**
 * Zing MP3 Audio Adapter:
 * - Signs requests with SHA-256 + HMAC-SHA512 (`sig`) and manages session/VIP cookies.
 * - Extracts direct MP3/M4A streams (320kbps when VIP cookie is provided, 128kbps free tier)
 *   and synced lyrics (`sentences` or LRC file).
 */
export class ZingMp3Adapter extends BaseAdapter {
  public readonly source = "zingmp3" as const;
  private cachedCookie: string | null = null;
  private cookieExpiresAt = 0;

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
      // Proceed without session cookie; autocomplete fallback still functions
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
      { headers }
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

    // streamingStatus === 2 denotes VIP-only unless ZINGMP3_COOKIE is provided
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

  public async search(query: string, limit: number = 10): Promise<UnifiedTrack[]> {
    return this.safeExecute("search", [], async () => {
      const trimmed = query.trim();
      if (!trimmed) return [];

      // Primary: Signed v2 search/multi
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

      // Resilient fallback: Public Zing MP3 autocomplete suggestions (type 1 = songs)
      const acQuery = new URLSearchParams({ num: String(limit), query: trimmed });
      const ac = await this.fetchJson<ZingAutocompleteResponse>(
        `${ZING_AUTOCOMPLETE_URL}?${acQuery.toString()}`,
        {
          headers: {
            Referer: `${ZING_BASE_URL}/`,
          },
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

  public async getTrackInfo(id: string): Promise<UnifiedTrack | null> {
    return this.safeExecute("getTrackInfo", null, async () => {
      const cleanId = id.trim();
      if (!cleanId) return null;

      const song = await this.requestSignedApi<ZingSongPayload>(
        "/api/v2/page/get/song",
        { id: cleanId }
      );
      return song ? this.mapSongToUnifiedTrack(song) : null;
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

      const url320 =
        typeof streaming["320"] === "string" &&
        streaming["320"].startsWith("http")
          ? streaming["320"]
          : null;
      const url128 =
        typeof streaming["128"] === "string" &&
        streaming["128"].startsWith("http")
          ? streaming["128"]
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
