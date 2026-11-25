const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 5;

const ipBuckets = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRegisterRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const key = ip || "unknown";
  const timestamps = (ipBuckets.get(key) ?? []).filter(
    (ts) => now - ts < WINDOW_MS
  );

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = timestamps[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((WINDOW_MS - (now - oldest)) / 1000)
    );
    ipBuckets.set(key, timestamps);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  timestamps.push(now);
  ipBuckets.set(key, timestamps);

  // Periodic cleanup to avoid unbounded memory growth
  if (ipBuckets.size > 1000) {
    for (const [k, list] of ipBuckets.entries()) {
      const valid = list.filter((ts) => now - ts < WINDOW_MS);
      if (valid.length === 0) ipBuckets.delete(k);
      else ipBuckets.set(k, valid);
    }
  }

  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_WINDOW - timestamps.length,
    retryAfterSeconds: 0,
  };
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "127.0.0.1";
}
