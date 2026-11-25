import { SAMPLE_LYRICS } from "@/lib/adapters/fallback-catalog";

export interface SyncedLyricLine {
  time: number; // seconds
  text: string;
}

export interface LyricsResult {
  synced: SyncedLyricLine[];
  plain: string | null;
  instrumental: boolean;
  source: "lrclib" | "sample" | "none";
}

interface LrcLibResponse {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
}

const LRC_LINE_REGEX = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

/**
 * Parses standard LRC format `[mm:ss.xx] Lyric text` into sorted timestamp array.
 */
export function parseLrc(lrc: string): SyncedLyricLine[] {
  const lines: SyncedLyricLine[] = [];

  for (const rawLine of lrc.split(/\r?\n/)) {
    const matches = Array.from(rawLine.matchAll(LRC_LINE_REGEX));
    if (matches.length === 0) continue;

    const text = rawLine.replace(LRC_LINE_REGEX, "").trim();
    if (!text) continue;

    for (const match of matches) {
      const mins = Number.parseInt(match[1], 10);
      const secs = Number.parseInt(match[2], 10);
      const fracRaw = match[3] || "0";
      const frac = Number.parseInt(fracRaw.padEnd(3, "0").slice(0, 3), 10) / 1000;
      lines.push({
        time: mins * 60 + secs + frac,
        text,
      });
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

function cleanMetadataString(raw: string): string {
  return raw
    .replace(/\s*\([^)]*(?:official|audio|video|lyric|audiophile|edition|mix|showcase|session|feat\.|ft\.)[^)]*\)/gi, "")
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/\s*·.*$/g, "")
    .trim();
}

export async function fetchLyrics(params: {
  id?: string;
  title: string;
  artist: string;
  duration?: number;
}): Promise<LyricsResult> {
  const cleanTitle = cleanMetadataString(params.title);
  const cleanArtist = cleanMetadataString(params.artist).split(",")[0]?.trim() || params.artist;

  try {
    // 1. Exact lookup via LRCLIB /api/get
    const getUrl = new URL("https://lrclib.net/api/get");
    getUrl.searchParams.set("track_name", cleanTitle || params.title);
    getUrl.searchParams.set("artist_name", cleanArtist || params.artist);
    if (params.duration && params.duration > 0) {
      getUrl.searchParams.set("duration", String(Math.round(params.duration)));
    }

    const res = await fetch(getUrl.toString(), {
      headers: {
        "User-Agent": "HnBeeMusic/1.0 (https://github.com/hnbeemusic)",
      },
      next: { revalidate: 86400 },
    });

    if (res.ok) {
      const data = (await res.json()) as LrcLibResponse;
      const synced = data.syncedLyrics ? parseLrc(data.syncedLyrics) : [];
      if (synced.length > 0 || data.plainLyrics || data.instrumental) {
        return {
          synced,
          plain: data.plainLyrics?.trim() || null,
          instrumental: Boolean(data.instrumental),
          source: "lrclib",
        };
      }
    }

    // 2. Fuzzy search fallback via LRCLIB /api/search
    const searchUrl = new URL("https://lrclib.net/api/search");
    searchUrl.searchParams.set("q", `${cleanArtist} ${cleanTitle}`.trim());

    const searchRes = await fetch(searchUrl.toString(), {
      headers: {
        "User-Agent": "HnBeeMusic/1.0 (https://github.com/hnbeemusic)",
      },
      next: { revalidate: 86400 },
    });

    if (searchRes.ok) {
      const list = (await searchRes.json()) as LrcLibResponse[];
      const withSynced = list.find((item) => Boolean(item.syncedLyrics));
      const best = withSynced || list[0];
      if (best) {
        const synced = best.syncedLyrics ? parseLrc(best.syncedLyrics) : [];
        if (synced.length > 0 || best.plainLyrics || best.instrumental) {
          return {
            synced,
            plain: best.plainLyrics?.trim() || null,
            instrumental: Boolean(best.instrumental),
            source: "lrclib",
          };
        }
      }
    }
  } catch (error) {
    console.error("[lyrics] LRCLIB lookup failed:", error);
  }

  // 3. Built-in sample fallback for demo showcase tracks
  if (params.id && SAMPLE_LYRICS[params.id]) {
    return {
      synced: [],
      plain: SAMPLE_LYRICS[params.id].join("\n"),
      instrumental: false,
      source: "sample",
    };
  }

  return {
    synced: [],
    plain: null,
    instrumental: false,
    source: "none",
  };
}
