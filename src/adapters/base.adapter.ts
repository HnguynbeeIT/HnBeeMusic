import type {
  IAudioAdapter,
  LyricsData,
  PlatformSource,
  StreamData,
  UnifiedTrack,
} from "@/types/audio";
import { buildUnifiedId } from "@/types/audio";

export interface AdapterHttpOptions {
  method?: "GET" | "POST" | "HEAD";
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  timeoutMs?: number;
  retries?: number;
}

export const DEFAULT_ADAPTER_TIMEOUT_MS = 5000;
export const DEFAULT_ADAPTER_RETRIES = 1;
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Abstract base class providing fault-isolated HTTP utilities (5000ms timeout,
 * 1 automatic network retry, and isolated error catching) for all audio adapters.
 */
export abstract class BaseAdapter implements IAudioAdapter {
  public abstract readonly source: PlatformSource;
  protected readonly timeoutMs: number;
  protected readonly maxRetries: number;

  constructor(
    timeoutMs: number = DEFAULT_ADAPTER_TIMEOUT_MS,
    maxRetries: number = DEFAULT_ADAPTER_RETRIES
  ) {
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
  }

  public abstract search(query: string, limit?: number): Promise<UnifiedTrack[]>;
  public abstract getTrackInfo(id: string): Promise<UnifiedTrack | null>;
  public abstract getStreamUrl(id: string): Promise<StreamData | null>;

  public async getLyrics(_id: string): Promise<LyricsData | null> {
    return null;
  }

  protected createUnifiedTrack(
    params: Omit<UnifiedTrack, "unifiedId" | "source">
  ): UnifiedTrack {
    return {
      ...params,
      source: this.source,
      unifiedId: buildUnifiedId(this.source, params.id),
    };
  }

  protected createTimeoutSignal(ms: number): AbortSignal {
    if (
      typeof AbortSignal !== "undefined" &&
      typeof AbortSignal.timeout === "function"
    ) {
      return AbortSignal.timeout(ms);
    }
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  }

  /**
   * Performs a fetch with strict timeout (default 5000ms) and automatic retry (default 1 retry)
   * on transient network / 5xx failures.
   */
  protected async fetchWithTimeout(
    url: string,
    options: AdapterHttpOptions = {}
  ): Promise<Response> {
    const timeout = options.timeoutMs ?? this.timeoutMs;
    const retries = options.retries ?? this.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: options.method ?? "GET",
          headers: {
            "User-Agent": DEFAULT_USER_AGENT,
            Accept: "application/json, text/plain, */*",
            ...options.headers,
          },
          body: options.body,
          signal: this.createTimeoutSignal(timeout),
          cache: "no-store",
        });

        if (response.status >= 500 && attempt < retries) {
          lastError = new Error(`Upstream HTTP ${response.status}`);
          continue;
        }
        return response;
      } catch (err: unknown) {
        lastError =
          err instanceof Error ? err : new Error("Unknown network error");
        if (attempt >= retries) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error(`Request failed for ${this.source}`);
  }

  protected async fetchJson<T>(
    url: string,
    options: AdapterHttpOptions = {}
  ): Promise<T | null> {
    const response = await this.fetchWithTimeout(url, options);
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return data as T;
  }

  protected async fetchText(
    url: string,
    options: AdapterHttpOptions = {}
  ): Promise<string | null> {
    const response = await this.fetchWithTimeout(url, options);
    if (!response.ok) return null;
    return response.text();
  }

  /**
   * Executes an adapter operation inside an isolated fault boundary so a single
   * platform failure never breaks the aggregated search or playback pipeline.
   */
  protected async safeExecute<T>(
    operationName: string,
    fallback: T,
    task: () => Promise<T>
  ): Promise<T> {
    try {
      return await task();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[adapter:${this.source}] ${operationName} failed: ${message}`);
      return fallback;
    }
  }
}
