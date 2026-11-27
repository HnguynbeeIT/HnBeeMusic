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
