import type { UnifiedTrack } from "@/lib/audio/types";

export type RegionCode = "VN" | "US" | "KR" | "JP" | "ALL";
export type ArtistRegion = "VN" | "US" | "KR" | "JP" | "OTHER";

export const ARTIST_REGION_META: Record<
  ArtistRegion,
  { flag: string; shortLabel: string; language: string }
> = {
  VN: { flag: "🇻🇳", shortLabel: "Việt Nam", language: "Tiếng Việt" },
  US: { flag: "🇺🇸", shortLabel: "US-UK", language: "English" },
  KR: { flag: "🇰🇷", shortLabel: "Hàn Quốc", language: "한국어" },
  JP: { flag: "🇯🇵", shortLabel: "Nhật Bản", language: "日本語" },
  OTHER: { flag: "🌍", shortLabel: "Khu vực khác", language: "Đa ngôn ngữ" },
};

export interface RegionInfo {
  code: RegionCode;
  label: string;
  shortLabel: string;
  flag: string;
  language: string;
  youtubeRegion?: string;
  youtubeLang?: string;
  spotifyMarket: string;
}

export const REGIONS: Record<RegionCode, RegionInfo> = {
  VN: {
    code: "VN",
    label: "Việt Nam (V-Pop / Rap Việt)",
    shortLabel: "Việt Nam",
    flag: "🇻🇳",
    language: "Tiếng Việt",
    youtubeRegion: "VN",
    youtubeLang: "vi",
    spotifyMarket: "VN",
  },
  US: {
    code: "US",
    label: "Quốc tế (US-UK / Global)",
    shortLabel: "Quốc tế",
    flag: "🌐",
    language: "English",
    youtubeRegion: "US",
    youtubeLang: "en",
    spotifyMarket: "US",
  },
  KR: {
    code: "KR",
    label: "Hàn Quốc (K-Pop)",
    shortLabel: "K-Pop",
    flag: "🇰🇷",
    language: "한국어",
    youtubeRegion: "KR",
    youtubeLang: "ko",
    spotifyMarket: "KR",
  },
  JP: {
    code: "JP",
    label: "Nhật Bản (J-Pop)",
    shortLabel: "J-Pop",
    flag: "🇯🇵",
    language: "日本語",
    youtubeRegion: "JP",
    youtubeLang: "ja",
    spotifyMarket: "JP",
  },
  ALL: {
    code: "ALL",
    label: "Tất cả khu vực",
    shortLabel: "Tất cả",
    flag: "🌍",
    language: "Đa ngôn ngữ",
    spotifyMarket: "VN",
  },
};

export const REGION_LIST: RegionInfo[] = [
  REGIONS.VN,
  REGIONS.US,
  REGIONS.KR,
  REGIONS.JP,
  REGIONS.ALL,
];

export function parseRegionCode(raw?: string | null): RegionCode {
  const upper = (raw || "").trim().toUpperCase();
  if (
    upper === "VN" ||
    upper === "US" ||
    upper === "KR" ||
    upper === "JP" ||
    upper === "ALL"
  ) {
    return upper;
  }
  return "VN";
}

// Script / language detectors for Regional Boost Scoring & Artist classification
const VIETNAMESE_CHARS =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const KOREAN_CHARS = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
const JAPANESE_CHARS = /[\u3040-\u309F\u30A0-\u30FF]/;

export function detectArtistRegion(
  genres: string[],
  artistName = ""
): { region: ArtistRegion; language: string } {
  const joined = genres.join(" ").toLowerCase();

  if (
    /v-pop|viet|rap viet|vinahouse|indie viet|nhac tre/i.test(joined) ||
    VIETNAMESE_CHARS.test(artistName)
  ) {
    return { region: "VN", language: "Tiếng Việt" };
  }

  if (/k-pop|k-rap|korean|k-indie|k-r&b/i.test(joined) || KOREAN_CHARS.test(artistName)) {
    return { region: "KR", language: "한국어" };
  }

  if (/j-pop|j-rock|anime|japanese|city pop|vocaloid/i.test(joined) || JAPANESE_CHARS.test(artistName)) {
    return { region: "JP", language: "日本語" };
  }

  return { region: "US", language: "English" };
}

/**
 * Regional Boost Scoring: promotes tracks matching the selected market/language
 * to the top while preserving global hits right below.
 */
export function scoreTrackForRegion(
  track: UnifiedTrack,
  region: RegionCode
): number {
  if (region === "ALL") return 0;
  const hay = `${track.title} ${track.artist}`;

  if (region === "VN") {
    let score = 0;
    if (VIETNAMESE_CHARS.test(hay)) score += 60;
    if (/\b(v-?pop|rap việt|rap viet|viet|vn|guyn|mck|sơn tùng|đen|wren|tlinh|hieuthuhai|obito|low g)\b/i.test(hay)) {
      score += 40;
    }
    return score;
  }

  if (region === "KR") {
    let score = 0;
    if (KOREAN_CHARS.test(hay)) score += 60;
    if (/\b(k-?pop|bts|blackpink|newjeans|aespa|iu|seventeen|stray kids|twice|jungkook)\b/i.test(hay)) {
      score += 40;
    }
    return score;
  }

  if (region === "JP") {
    let score = 0;
    if (JAPANESE_CHARS.test(hay)) score += 60;
    if (/\b(j-?pop|yoasobi|fujii kaze|ado|kenshi|anime|ost|lisa|radwimps)\b/i.test(hay)) {
      score += 40;
    }
    return score;
  }

  if (region === "US") {
    // Prefer English/Latin non-VN/KR/JP tracks for US-UK global priority
    if (
      !VIETNAMESE_CHARS.test(hay) &&
      !KOREAN_CHARS.test(hay) &&
      !JAPANESE_CHARS.test(hay)
    ) {
      return 30;
    }
    return 0;
  }

  return 0;
}

export function sortTracksByRegion(
  tracks: UnifiedTrack[],
  region: RegionCode
): UnifiedTrack[] {
  if (region === "ALL") return tracks;
  return tracks
    .map((track, idx) => ({
      track,
      idx,
      score: scoreTrackForRegion(track, region),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.idx - b.idx;
    })
    .map((entry) => entry.track);
}
