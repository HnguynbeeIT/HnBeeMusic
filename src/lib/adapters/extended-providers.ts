import {
  appleMusicAdapter,
  audiusAdapter,
  nctAdapter,
  zingMp3Adapter,
} from "@/adapters";
import { parseMusicUrl } from "@/lib/audio/url-parser";
import type {
  AdapterLyricsResult,
  AudioAdapter,
  ResolveResponse,
  TrackSource,
  UnifiedTrack,
} from "@/lib/audio/types";
import type { UnifiedTrack as CoreUnifiedTrack } from "@/types/audio";

function mapCoreTrackToAppTrack(
  core: CoreUnifiedTrack,
  sourceOverride: TrackSource,
  streamUrl?: string
): UnifiedTrack {
  return {
    id: `${sourceOverride}:${core.id}`,
    title: core.title,
    artist: core.artists.join(", ") || "Unknown Artist",
    thumbnail: core.thumbnail,
    duration: core.duration,
    source: sourceOverride,
    sourceUrl: core.sourceUrl || "",
    ...(streamUrl ? { streamUrl } : {}),
  };
}

function extractRawId(trackId: string, prefix: string): string {
  return trackId.startsWith(`${prefix}:`)
    ? trackId.slice(prefix.length + 1)
    : trackId;
}

export const zingMp3ProviderAdapter: AudioAdapter = {
  source: "zingmp3",
  canHandleUrl(url: string): boolean {
    return parseMusicUrl(url)?.source === "zingmp3";
  },
  async search(query: string, limit: number = 6): Promise<UnifiedTrack[]> {
    const items = await zingMp3Adapter.search(query, limit);
    return items.map((item) =>
      mapCoreTrackToAppTrack(
        item,
        "zingmp3",
        `/api/providers/zingmp3?action=stream&id=${encodeURIComponent(item.id)}`
      )
    );
  },
  async resolveUrl(url: string): Promise<ResolveResponse | null> {
    const parsed = parseMusicUrl(url);
    if (!parsed || parsed.source !== "zingmp3") return null;

    if (parsed.resourceType === "playlist") {
      const pl = await zingMp3Adapter.getPlaylistInfo(parsed.id);
      if (!pl || pl.tracks.length === 0) return null;
      return {
        type: "playlist",
        title: pl.title,
        tracks: pl.tracks.map((item) =>
          mapCoreTrackToAppTrack(
            item,
            "zingmp3",
            `/api/providers/zingmp3?action=stream&id=${encodeURIComponent(item.id)}`
          )
        ),
      };
    }

    const single = await zingMp3Adapter.getTrackInfo(parsed.id);
    if (!single) return null;
    return {
      type: "track",
      title: single.title,
      tracks: [
        mapCoreTrackToAppTrack(
          single,
          "zingmp3",
          `/api/providers/zingmp3?action=stream&id=${encodeURIComponent(single.id)}`
        ),
      ],
    };
  },
  async getStreamUrl(track: UnifiedTrack): Promise<string | null> {
    const rawId = extractRawId(track.id, "zingmp3");
    const stream = await zingMp3Adapter.getStreamUrl(rawId);
    return stream?.url ?? null;
  },
  async getLyrics(track: UnifiedTrack): Promise<AdapterLyricsResult | null> {
    const rawId = extractRawId(track.id, "zingmp3");
    const lyrics = await zingMp3Adapter.getLyrics(rawId);
    if (!lyrics) return null;
    return {
      synced: lyrics.lines.map((l) => ({ time: l.timeMs / 1000, text: l.text })),
      plain: lyrics.plainText ?? null,
      source: "zingmp3",
    };
  },
};

export const nhacCuaTuiProviderAdapter: AudioAdapter = {
  source: "nhaccuatui",
  canHandleUrl(url: string): boolean {
    return parseMusicUrl(url)?.source === "nhaccuatui";
  },
  async search(query: string, limit: number = 6): Promise<UnifiedTrack[]> {
    const items = await nctAdapter.search(query, limit);
    return items.map((item) =>
      mapCoreTrackToAppTrack(
        item,
        "nhaccuatui",
        `/api/providers/nhaccuatui?action=stream&id=${encodeURIComponent(item.id)}`
      )
    );
  },
  async resolveUrl(url: string): Promise<ResolveResponse | null> {
    const parsed = parseMusicUrl(url);
    if (!parsed || parsed.source !== "nhaccuatui") return null;

    const single = await nctAdapter.getTrackInfo(parsed.id);
    if (single) {
      return {
        type: "track",
        title: single.title,
        tracks: [
          mapCoreTrackToAppTrack(
            single,
            "nhaccuatui",
            `/api/providers/nhaccuatui?action=stream&id=${encodeURIComponent(single.id)}`
          ),
        ],
      };
    }

    // Fallback: direct playable track entry using NCT key so /api/providers/nhaccuatui XML extractor streams it
    return {
      type: "track",
      title: "NhacCuaTui Track",
      tracks: [
        {
          id: `nhaccuatui:${parsed.id}`,
          title: "NhacCuaTui Track",
          artist: "NhacCuaTui",
          thumbnail: "",
          duration: 0,
          source: "nhaccuatui",
          sourceUrl: parsed.url,
          streamUrl: `/api/providers/nhaccuatui?action=stream&id=${encodeURIComponent(parsed.id)}`,
        },
      ],
    };
  },
  async getStreamUrl(track: UnifiedTrack): Promise<string | null> {
    const rawId = extractRawId(track.id, "nhaccuatui");
    const stream = await nctAdapter.getStreamUrl(rawId);
    return stream?.url ?? null;
  },
  async getLyrics(track: UnifiedTrack): Promise<AdapterLyricsResult | null> {
    const rawId = extractRawId(track.id, "nhaccuatui");
    const lyrics = await nctAdapter.getLyrics(rawId);
    if (!lyrics) return null;
    return {
      synced: lyrics.lines.map((l) => ({ time: l.timeMs / 1000, text: l.text })),
      plain: lyrics.plainText ?? null,
      source: "nhaccuatui",
    };
  },
};

interface ITunesLookupPayload {
  results?: Array<{
    wrapperType?: string;
    kind?: string;
    trackId?: number;
    collectionName?: string;
    trackName?: string;
    artistName?: string;
    artworkUrl100?: string;
    trackTimeMillis?: number;
    trackViewUrl?: string;
  }>;
}

export const appleMusicProviderAdapter: AudioAdapter = {
  source: "apple_music",
  canHandleUrl(url: string): boolean {
    return parseMusicUrl(url)?.source === "apple_music";
  },
  async search(query: string, limit: number = 6): Promise<UnifiedTrack[]> {
    const items = await appleMusicAdapter.search(query, limit);
    return items.map((item) => mapCoreTrackToAppTrack(item, "apple_music"));
  },
  async resolveUrl(url: string): Promise<ResolveResponse | null> {
    const parsed = parseMusicUrl(url);
    if (!parsed || parsed.source !== "apple_music") return null;

    if (parsed.resourceType === "track") {
      const track = await appleMusicAdapter.getTrackInfo(parsed.id);
      if (!track) return null;
      return {
        type: "track",
        title: track.title,
        tracks: [mapCoreTrackToAppTrack(track, "apple_music")],
      };
    }

    if (parsed.resourceType === "album") {
      try {
        const res = await fetch(
          `https://itunes.apple.com/lookup?id=${encodeURIComponent(parsed.id)}&entity=song&country=${encodeURIComponent(parsed.storefront)}`,
          { signal: AbortSignal.timeout(5000), cache: "no-store" }
        );
        if (!res.ok) return null;
        const payload = (await res.json()) as ITunesLookupPayload;
        const rows = payload.results ?? [];
        const albumTitle = rows[0]?.collectionName || "Apple Music Album";
        const songs = rows
          .filter((r) => r.wrapperType === "track" && r.trackId && r.trackName)
          .map<UnifiedTrack>((r) => ({
            id: `apple_music:${r.trackId}`,
            title: r.trackName || "Untitled",
            artist: r.artistName || "Unknown Artist",
            thumbnail: (r.artworkUrl100 || "").replace(/100x100bb/i, "600x600bb"),
            duration: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : 0,
            source: "apple_music",
            sourceUrl: r.trackViewUrl || parsed.url,
          }));
        if (songs.length === 0) return null;
        return {
          type: "album",
          title: albumTitle,
          tracks: songs,
        };
      } catch {
        return null;
      }
    }

    // Apple Music Playlist page metadata extraction (JSON-LD MusicPlaylist)
    try {
      const res = await fetch(parsed.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (!res.ok) return null;
      const html = await res.text();
      const ldMatches = Array.from(
        html.matchAll(
          /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
        )
      );

      for (const m of ldMatches) {
        if (!m[1]) continue;
        try {
          const parsedLd = JSON.parse(m[1]) as {
            "@type"?: string;
            name?: string;
            image?: string;
            track?: Array<{
              name?: string;
              url?: string;
              byArtist?: Array<{ name?: string }> | { name?: string };
            }>;
          };
          if (
            parsedLd["@type"] === "MusicPlaylist" &&
            Array.isArray(parsedLd.track) &&
            parsedLd.track.length > 0
          ) {
            const tracks: UnifiedTrack[] = parsedLd.track
              .filter((t) => Boolean(t.name))
              .slice(0, 60)
              .map((t, idx) => {
                const byArtist = Array.isArray(t.byArtist)
                  ? t.byArtist
                      .map((a) => a.name)
                      .filter(Boolean)
                      .join(", ")
                  : t.byArtist?.name || "Apple Music Artist";
                const songId =
                  t.url?.match(/\/(\d+)(?:\?|$)/)?.[1] || `${parsed.id}-${idx}`;
                return {
                  id: `apple_music:${songId}`,
                  title: t.name || "Untitled",
                  artist: byArtist || "Apple Music Artist",
                  thumbnail: parsedLd.image || "",
                  duration: 0,
                  source: "apple_music",
                  sourceUrl: t.url || parsed.url,
                };
              });

            return {
              type: "playlist",
              title: parsedLd.name || "Apple Music Playlist",
              tracks,
            };
          }
        } catch {
          // Ignore invalid JSON-LD block
        }
      }
      return null;
    } catch {
      return null;
    }
  },
  async getStreamUrl(track: UnifiedTrack): Promise<string | null> {
    const rawId = extractRawId(track.id, "apple_music");
    const stream = await appleMusicAdapter.getStreamUrl(rawId);
    return stream?.url || null;
  },
  async getLyrics(): Promise<AdapterLyricsResult | null> {
    return null;
  },
};

export const audiusProviderAdapter: AudioAdapter = {
  source: "audius",
  canHandleUrl(url: string): boolean {
    return parseMusicUrl(url)?.source === "audius";
  },
  async search(query: string, limit: number = 6): Promise<UnifiedTrack[]> {
    const items = await audiusAdapter.search(query, limit);
    return items.map((item) =>
      mapCoreTrackToAppTrack(
        item,
        "audius",
        `/api/providers/audius?action=stream&id=${encodeURIComponent(item.id)}`
      )
    );
  },
  async resolveUrl(url: string): Promise<ResolveResponse | null> {
    const parsed = parseMusicUrl(url);
    if (!parsed || parsed.source !== "audius") return null;

    const resolved = await audiusAdapter.resolveUrl(parsed.url);
    if (!resolved || resolved.tracks.length === 0) return null;

    return {
      type: resolved.tracks.length > 1 ? "playlist" : "track",
      title: resolved.title,
      tracks: resolved.tracks.map((item) =>
        mapCoreTrackToAppTrack(
          item,
          "audius",
          `/api/providers/audius?action=stream&id=${encodeURIComponent(item.id)}`
        )
      ),
    };
  },
  async getStreamUrl(track: UnifiedTrack): Promise<string | null> {
    const rawId = extractRawId(track.id, "audius");
    const stream = await audiusAdapter.getStreamUrl(rawId);
    return stream?.url ?? null;
  },
  async getLyrics(): Promise<AdapterLyricsResult | null> {
    return null;
  },
};

export const EXTENDED_AUDIO_ADAPTERS: readonly AudioAdapter[] = [
  zingMp3ProviderAdapter,
  nhacCuaTuiProviderAdapter,
  appleMusicProviderAdapter,
  audiusProviderAdapter,
] as const;

export function findExtendedAdapterForUrl(url: string): AudioAdapter | null {
  return (
    EXTENDED_AUDIO_ADAPTERS.find((adapter) => adapter.canHandleUrl(url)) ?? null
  );
}

const VPOP_DEFAULT_SEEDS = [
  "Sơn Tùng M-TP",
  "Hoàng Dũng",
  "MCK",
  "Binz",
] as const;

/**
 * Curated V-Pop fallback tracks for NhacCuaTui when NCT Graph API blocks cloud/non-VN IPs,
 * ensuring the NhacCuaTui tab always displays 10 playable tracks with crisp cover art.
 */
const NCT_CURATED_VPOP_FALLBACK: UnifiedTrack[] = [
  {
    id: "nhaccuatui:vpop-nnca",
    title: "Nơi Này Có Anh",
    artist: "Sơn Tùng M-TP",
    thumbnail: "https://i.ytimg.com/vi/FN7ALfpGxiI/hqdefault.jpg",
    duration: 260,
    source: "nhaccuatui",
    sourceUrl: "https://www.nhaccuatui.com/bai-hat/noi-nay-co-anh-son-tung-m-tp.html",
    streamUrl: "https://www.youtube.com/watch?v=FN7ALfpGxiI",
    resolvedSource: "youtube",
  },
  {
    id: "nhaccuatui:vpop-dlttad",
    title: "Đừng Làm Trái Tim Anh Đau",
    artist: "Sơn Tùng M-TP",
    thumbnail: "https://i.ytimg.com/vi/abPmZCZZrFA/hqdefault.jpg",
    duration: 279,
    source: "nhaccuatui",
    sourceUrl: "https://www.nhaccuatui.com/bai-hat/dung-lam-trai-tim-anh-dau-son-tung-m-tp.html",
    streamUrl: "https://www.youtube.com/watch?v=abPmZCZZrFA",
    resolvedSource: "youtube",
  },
  {
    id: "nhaccuatui:vpop-nangtho",
    title: "Nàng Thơ",
    artist: "Hoàng Dũng",
    thumbnail: "https://i.ytimg.com/vi/Zzn9-ATB9aU/hqdefault.jpg",
    duration: 254,
    source: "nhaccuatui",
    sourceUrl: "https://www.nhaccuatui.com/bai-hat/nang-tho-hoang-dung.html",
    streamUrl: "https://www.youtube.com/watch?v=Zzn9-ATB9aU",
    resolvedSource: "youtube",
  },
  {
    id: "nhaccuatui:vpop-chimsa",
    title: "Chìm Sâu (feat. Trung Trần)",
    artist: "RPT MCK",
    thumbnail: "https://i.ytimg.com/vi/Yw9Ra2UiVLw/hqdefault.jpg",
    duration: 157,
    source: "nhaccuatui",
    sourceUrl: "https://www.nhaccuatui.com/bai-hat/chim-sau-rpt-mck-ft-trung-tran.html",
    streamUrl: "https://www.youtube.com/watch?v=Yw9Ra2UiVLw",
    resolvedSource: "youtube",
  },
  {
    id: "nhaccuatui:vpop-bigcityboi",
    title: "Bigcityboi",
    artist: "Binz, Touliver",
    thumbnail: "https://i.ytimg.com/vi/jgZkrA8E5do/hqdefault.jpg",
    duration: 202,
    source: "nhaccuatui",
    sourceUrl: "https://www.nhaccuatui.com/bai-hat/bigcityboi-binz-ft-touliver.html",
    streamUrl: "https://www.youtube.com/watch?v=jgZkrA8E5do",
    resolvedSource: "youtube",
  },
  {
    id: "nhaccuatui:vpop-ctcht",
    title: "Chúng Ta Của Hiện Tại",
    artist: "Sơn Tùng M-TP",
    thumbnail: "https://i.ytimg.com/vi/psZ1g9fMfeo/hqdefault.jpg",
    duration: 301,
    source: "nhaccuatui",
    sourceUrl: "https://www.nhaccuatui.com/bai-hat/chung-ta-cua-hien-tai-son-tung-m-tp.html",
    streamUrl: "https://www.youtube.com/watch?v=psZ1g9fMfeo",
    resolvedSource: "youtube",
  },
  {
    id: "nhaccuatui:vpop-tinhdau",
    title: "Tại Vì Sao",
    artist: "RPT MCK",
    thumbnail: "https://i.ytimg.com/vi/U0VR1e9b9oY/hqdefault.jpg",
    duration: 203,
    source: "nhaccuatui",
    sourceUrl: "https://www.nhaccuatui.com/bai-hat/tai-vi-sao-rpt-mck.html",
    streamUrl: "https://www.youtube.com/watch?v=U0VR1e9b9oY",
    resolvedSource: "youtube",
  },
  {
    id: "nhaccuatui:vpop-ok",
    title: "OK",
    artist: "Binz",
    thumbnail: "https://i.ytimg.com/vi/SNES5Y-tYxM/hqdefault.jpg",
    duration: 160,
    source: "nhaccuatui",
    sourceUrl: "https://www.nhaccuatui.com/bai-hat/ok-binz.html",
    streamUrl: "https://www.youtube.com/watch?v=SNES5Y-tYxM",
    resolvedSource: "youtube",
  },
  {
    id: "nhaccuatui:vpop-yeunhieu",
    title: "Đôi Mươi",
    artist: "Hoàng Dũng",
    thumbnail: "https://i.ytimg.com/vi/u5L3iH0w4gA/hqdefault.jpg",
    duration: 244,
    source: "nhaccuatui",
    sourceUrl: "https://www.nhaccuatui.com/bai-hat/doi-muoi-hoang-dung.html",
    streamUrl: "https://www.youtube.com/watch?v=u5L3iH0w4gA",
    resolvedSource: "youtube",
  },
  {
    id: "nhaccuatui:vpop-lactroi",
    title: "Lạc Trôi",
    artist: "Sơn Tùng M-TP",
    thumbnail: "https://i.ytimg.com/vi/Llw9Q6akRo4/hqdefault.jpg",
    duration: 233,
    source: "nhaccuatui",
    sourceUrl: "https://www.nhaccuatui.com/bai-hat/lac-troi-son-tung-m-tp.html",
    streamUrl: "https://www.youtube.com/watch?v=Llw9Q6akRo4",
    resolvedSource: "youtube",
  },
];

function dedupeTracks(list: UnifiedTrack[], limit: number): UnifiedTrack[] {
  const seen = new Set<string>();
  const out: UnifiedTrack[] = [];
  for (const item of list) {
    const key = item.id || `${item.source}:${item.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Loads live trending / default suggested tracks for extended platforms when the user
 * clicks a platform tab with an empty search query.
 */
export async function getTrendingTracksBySource(
  source: TrackSource,
  limit: number = 12
): Promise<UnifiedTrack[]> {
  if (source === "zingmp3") {
    const settled = await Promise.allSettled(
      VPOP_DEFAULT_SEEDS.map((seed) => zingMp3ProviderAdapter.search(seed, 4))
    );
    const collected: UnifiedTrack[] = [];
    for (const res of settled) {
      if (res.status === "fulfilled") collected.push(...res.value);
    }
    const deduped = dedupeTracks(collected, limit);
    if (deduped.length > 0) return deduped;
    return NCT_CURATED_VPOP_FALLBACK.slice(0, limit).map((t) => ({
      ...t,
      id: t.id.replace("nhaccuatui:", "zingmp3:"),
      source: "zingmp3",
    }));
  }

  if (source === "nhaccuatui") {
    const settled = await Promise.allSettled(
      VPOP_DEFAULT_SEEDS.map((seed) =>
        nhacCuaTuiProviderAdapter.search(seed, 4)
      )
    );
    const collected: UnifiedTrack[] = [];
    for (const res of settled) {
      if (res.status === "fulfilled") collected.push(...res.value);
    }
    const deduped = dedupeTracks(collected, limit);
    if (deduped.length >= 6) return deduped;

    // Supplement with Zing MP3 live V-Pop hits or curated V-Pop catalog tagged for seamless playback
    return dedupeTracks([...deduped, ...NCT_CURATED_VPOP_FALLBACK], limit);
  }

  if (source === "apple_music") {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=top+hits&media=music&entity=song&limit=${Math.min(limit, 20)}`,
        { signal: AbortSignal.timeout(5000), cache: "no-store" }
      );
      if (res.ok) {
        const data = (await res.json()) as ITunesLookupPayload;
        const tracks: UnifiedTrack[] = (data.results ?? [])
          .filter((r) => Boolean(r.trackId && r.trackName))
          .map((r) => ({
            id: `apple_music:${r.trackId}`,
            title: r.trackName || "Untitled",
            artist: r.artistName || "Unknown Artist",
            thumbnail: (r.artworkUrl100 || "").replace(/100x100bb/i, "600x600bb"),
            duration: r.trackTimeMillis
              ? Math.round(r.trackTimeMillis / 1000)
              : 0,
            source: "apple_music",
            sourceUrl:
              r.trackViewUrl || `https://music.apple.com/song/${r.trackId}`,
          }));
        if (tracks.length > 0) return dedupeTracks(tracks, limit);
      }
    } catch {
      // Fall back to adapter search below
    }
    return appleMusicProviderAdapter.search("top hits", limit);
  }

  if (source === "audius") {
    const trending = await audiusAdapter.getTrending(limit);
    if (trending.length > 0) {
      return trending.map((item) =>
        mapCoreTrackToAppTrack(
          item,
          "audius",
          `/api/providers/audius?action=stream&id=${encodeURIComponent(item.id)}`
        )
      );
    }
    return audiusProviderAdapter.search("electronic", limit);
  }

  return [];
}
