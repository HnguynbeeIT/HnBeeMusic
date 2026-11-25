export type SponsorBlockCategory =
  | "sponsor"
  | "selfpromo"
  | "interaction"
  | "intro"
  | "outro"
  | "music_offtopic";

export interface SponsorSegment {
  segment: [number, number];
  category: SponsorBlockCategory;
  UUID?: string;
}

export const SPONSORBLOCK_CATEGORIES: SponsorBlockCategory[] = [
  "sponsor",
  "selfpromo",
  "interaction",
  "intro",
  "outro",
  "music_offtopic",
];

const segmentCache = new Map<string, SponsorSegment[]>();

/**
 * Fetches skip segments from the public, zero-key SponsorBlock API for a YouTube video.
 * Caches results in memory per videoId (404 means no segments exist -> cached as []).
 */
export async function fetchSponsorSegments(
  videoId: string
): Promise<SponsorSegment[]> {
  const cleanId = videoId.trim();
  if (!cleanId) return [];

  if (segmentCache.has(cleanId)) {
    return segmentCache.get(cleanId)!;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const url = new URL("https://sponsor.ajay.app/api/skipSegments");
    url.searchParams.set("videoID", cleanId);
    url.searchParams.set(
      "categories",
      JSON.stringify(SPONSORBLOCK_CATEGORIES)
    );

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      cache: "force-cache",
    });
    clearTimeout(timeout);

    if (res.status === 404) {
      segmentCache.set(cleanId, []);
      return [];
    }

    if (!res.ok) {
      return [];
    }

    const raw = (await res.json()) as unknown;
    if (!Array.isArray(raw)) {
      segmentCache.set(cleanId, []);
      return [];
    }

    const segments: SponsorSegment[] = raw
      .filter(
        (item): item is SponsorSegment =>
          Boolean(item) &&
          Array.isArray(item.segment) &&
          item.segment.length === 2 &&
          typeof item.segment[0] === "number" &&
          typeof item.segment[1] === "number" &&
          item.segment[1] > item.segment[0] + 0.5
      )
      .sort((a, b) => a.segment[0] - b.segment[0]);

    segmentCache.set(cleanId, segments);
    return segments;
  } catch {
    return [];
  }
}

export function getSponsorSegmentKey(seg: SponsorSegment): string {
  return (
    seg.UUID ||
    `${seg.category}:${seg.segment[0].toFixed(1)}-${seg.segment[1].toFixed(1)}`
  );
}

/**
 * Returns the first unskipped SponsorBlock segment containing `currentTime`.
 */
export function findActiveSponsorSegment(
  currentTime: number,
  segments: SponsorSegment[],
  skippedKeys: Set<string>
): SponsorSegment | null {
  if (!segments.length || !Number.isFinite(currentTime)) return null;

  for (const seg of segments) {
    const [start, end] = seg.segment;
    const key = getSponsorSegmentKey(seg);
    if (skippedKeys.has(key)) continue;

    // Trigger when playback enters [start, end - 0.5]
    if (currentTime >= start - 0.15 && currentTime < end - 0.5) {
      return seg;
    }
  }
  return null;
}

export function getSponsorCategoryLabel(
  category: SponsorBlockCategory
): string {
  switch (category) {
    case "sponsor":
      return "đoạn quảng cáo";
    case "selfpromo":
      return "đoạn tự quảng bá";
    case "interaction":
      return "đoạn kêu gọi tương tác";
    case "intro":
      return "đoạn giới thiệu (Intro)";
    case "outro":
      return "đoạn kết (Outro)";
    case "music_offtopic":
      return "đoạn thoại phi âm nhạc";
    default:
      return "đoạn giới thiệu / quảng cáo";
  }
}
