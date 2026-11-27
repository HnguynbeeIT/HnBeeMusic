import type {
  AdapterSearchError,
  AggregatedSearchResult,
  IAudioAdapter,
  LyricsData,
  PlatformSource,
  StreamData,
  UnifiedTrack,
} from "@/types/audio";
import { parseUnifiedId } from "@/types/audio";

interface StreamCacheEntry {
  data: StreamData;
  cachedAt: number;
  expiresAt: number;
}

const DEFAULT_STREAM_TTL_MS = 10 * 60 * 1000; // 10 minutes fallback TTL
const EXPIRY_SAFETY_MARGIN_MS = 30 * 1000; // Refresh 30s before actual upstream expiration
const MAX_CACHE_ENTRIES = 500;

/**
 * Multi-platform AggregatorService:
 * - Registers independent IAudioAdapter instances by PlatformSource.
 * - Executes parallel searches via Promise.allSettled() with strict fault isolation.
 * - Maintains an in-memory TTL cache for StreamData honoring upstream expiresAt timestamps.
 */
export class AggregatorService {
  private readonly adapters = new Map<PlatformSource, IAudioAdapter>();
  private readonly streamCache = new Map<string, StreamCacheEntry>();

  public registerAdapter(adapter: IAudioAdapter): this {
    this.adapters.set(adapter.source, adapter);
    return this;
  }

  public unregisterAdapter(source: PlatformSource): boolean {
    return this.adapters.delete(source);
  }

  public getAdapter(source: PlatformSource): IAudioAdapter | undefined {
    return this.adapters.get(source);
  }

  public getRegisteredSources(): PlatformSource[] {
    return Array.from(this.adapters.keys());
  }

  public clearStreamCache(): void {
    this.streamCache.clear();
  }

  /**
   * Searches all registered adapters (or a requested subset) in parallel using Promise.allSettled.
   * Interleaves results round-robin across platforms so no single source monopolizes the top slots.
   */
  public async searchAll(
    query: string,
    limitPerPlatform: number = 8,
    sources?: PlatformSource[]
  ): Promise<AggregatedSearchResult> {
    const startedAt = Date.now();
    const trimmed = query.trim();

    if (!trimmed) {
      return {
        query: "",
        tracks: [],
        byPlatform: {},
        errors: [],
        durationMs: 0,
      };
    }

    const activeAdapters = sources?.length
      ? sources
          .map((src) => this.adapters.get(src))
          .filter((a): a is IAudioAdapter => Boolean(a))
      : Array.from(this.adapters.values());

    const settled = await Promise.allSettled(
      activeAdapters.map(async (adapter) => {
        const items = await adapter.search(trimmed, limitPerPlatform);
        return { source: adapter.source, items };
      })
    );

    const byPlatform: Partial<Record<PlatformSource, UnifiedTrack[]>> = {};
    const errors: AdapterSearchError[] = [];
    const buckets: UnifiedTrack[][] = [];

    settled.forEach((result, index) => {
      const adapter = activeAdapters[index];
      if (!adapter) return;

      if (result.status === "fulfilled") {
        const list = result.value.items.slice(0, limitPerPlatform);
        byPlatform[adapter.source] = list;
        if (list.length > 0) {
          buckets.push(list);
        }
      } else {
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : "Adapter search rejected";
        errors.push({ source: adapter.source, message });
      }
    });

    // Interleave results across platforms while deduplicating by unifiedId
    const tracks: UnifiedTrack[] = [];
    const seenIds = new Set<string>();
    const maxLen = buckets.reduce((max, list) => Math.max(max, list.length), 0);

    for (let i = 0; i < maxLen; i += 1) {
      for (const bucket of buckets) {
        const item = bucket[i];
        if (!item || seenIds.has(item.unifiedId)) continue;
        seenIds.add(item.unifiedId);
        tracks.push(item);
      }
    }

    return {
      query: trimmed,
      tracks,
      byPlatform,
      errors,
      durationMs: Date.now() - startedAt,
    };
  }

  public async getTrackInfo(unifiedId: string): Promise<UnifiedTrack | null> {
    const parsed = parseUnifiedId(unifiedId);
    if (!parsed) return null;

    const adapter = this.adapters.get(parsed.source);
    if (!adapter) return null;

    return adapter.getTrackInfo(parsed.id);
  }

  public async getStreamUrl(
    unifiedId: string,
    options: { bypassCache?: boolean } = {}
  ): Promise<StreamData | null> {
    const parsed = parseUnifiedId(unifiedId);
    if (!parsed) return null;

    const cacheKey = `${parsed.source}:${parsed.id}`;
    const now = Date.now();

    if (!options.bypassCache) {
      const cached = this.streamCache.get(cacheKey);
      if (cached && now < cached.expiresAt - EXPIRY_SAFETY_MARGIN_MS) {
        return cached.data;
      }
      if (cached) {
        this.streamCache.delete(cacheKey);
      }
    }

    const adapter = this.adapters.get(parsed.source);
    if (!adapter) return null;

    const streamData = await adapter.getStreamUrl(parsed.id);
    if (!streamData || !streamData.url) return streamData;

    const expiresAt =
      typeof streamData.expiresAt === "number" && streamData.expiresAt > now
        ? streamData.expiresAt
        : now + DEFAULT_STREAM_TTL_MS;

    this.setCachedStream(cacheKey, {
      data: { ...streamData, expiresAt },
      cachedAt: now,
      expiresAt,
    });

    return { ...streamData, expiresAt };
  }

  public async getLyrics(unifiedId: string): Promise<LyricsData | null> {
    const parsed = parseUnifiedId(unifiedId);
    if (!parsed) return null;

    const adapter = this.adapters.get(parsed.source);
    if (!adapter || typeof adapter.getLyrics !== "function") return null;

    return adapter.getLyrics(parsed.id);
  }

  private setCachedStream(key: string, entry: StreamCacheEntry): void {
    if (this.streamCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.streamCache.keys().next().value;
      if (oldestKey) {
        this.streamCache.delete(oldestKey);
      }
    }
    this.streamCache.set(key, entry);
  }
}

export const aggregatorService = new AggregatorService();
