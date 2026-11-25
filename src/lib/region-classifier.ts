import { findVerifiedArtist } from "@/config/verified-artists";
import type { ArtistRegion, RegionCode } from "@/lib/audio/region";

export interface ArtistClassificationSignals {
  name: string;
  artistId?: string;
  genres?: string[];
  sampleTitles?: string[];
  youtubeCountry?: string;
  activeRegion?: RegionCode;
}

export interface ArtistClassificationResult {
  region: ArtistRegion;
  language: string;
}

const VIETNAMESE_DIACRITICS =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const VIETNAMESE_PHRASE_HINTS =
  /\b(sài gòn|saigon|hà nội|hanoi|việt nam|vietnam|rap việt|rap viet|nhạc trẻ|nhac tre|v-?pop|vinahouse|lostsaigon|anh đã|em là|chỉ có anh|ngày đã qua|kí ức|xoa kính|chìm sâu|buồn của anh)\b/i;

const KOREAN_HANGUL = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
const JAPANESE_KANA = /[\u3040-\u309F\u30A0-\u30FF]/;

// Curated Vietnamese artists, indie acts & labels (normalized lowercase)
const KNOWN_VN_ARTISTS = new Set([
  "guyn",
  "guyn official",
  "guyn offical",
  "hnbeestudio",
  "sixkie dawgz",
  "sixkiedawgz",
  "mck",
  "rpt mck",
  "obito",
  "grey d",
  "tlinh",
  "low g",
  "hieuthuhai",
  "wren evans",
  "son tung m-tp",
  "sơn tùng m-tp",
  "den",
  "đen",
  "den vau",
  "đen vâu",
  "binz",
  "karik",
  "suboi",
  "b ray",
  "bray",
  "andree right hand",
  "justatee",
  "rhymastic",
  "soobin",
  "soobin hoang son",
  "hoang dung",
  "hoàng dũng",
  "vu.",
  "vũ.",
  "ngot",
  "ngọt",
  "ca hoi hoang",
  "cá hồi hoang",
  "chillies",
  "amee",
  "erik",
  "duc phuc",
  "đức phúc",
  "truc nhan",
  "trúc nhân",
  "phan manh quynh",
  "phan mạnh quỳnh",
  "bich phuong",
  "bích phương",
  "my tam",
  "mỹ tâm",
  "ha anh tuan",
  "hà anh tuấn",
  "tang duy tan",
  "tăng duy tân",
  "mono",
  "phao",
  "pháo",
  "16 typh",
  "wxrdie",
  "vsoul",
  "dangrangto",
  "hurrykng",
  "negav",
  "wean",
  "marzuz",
  "touliver",
  "spacespeakers",
  "osad",
  "min",
  "hoa minzy",
  "hòa minzy",
  "van mai huong",
  "văn mai hương",
  "bui anh tuan",
  "bùi anh tuấn",
  "noo phuoc thinh",
  "noo phước thịnh",
  "da lab",
  "dalab",
  "rapital",
  "gerdnang",
  "g5r",
  "datmaniac",
  "robbie",
  "rhyder",
  "captain boy",
  "quang hung masterd",
  "quang hùng masterd",
  "duong domic",
  "dương domic",
]);

const KNOWN_KR_ARTISTS = new Set([
  "bts",
  "blackpink",
  "newjeans",
  "aespa",
  "iu",
  "seventeen",
  "stray kids",
  "twice",
  "jungkook",
  "jung kook",
  "jimin",
  "v",
  "suga",
  "rm",
  "jennie",
  "lisa",
  "rose",
  "rosé",
  "jisoo",
  "le sserafim",
  "ive",
  "babymonster",
  "illit",
  "exo",
  "bigbang",
  "g-dragon",
  "zico",
  "dean",
  "dpr ian",
  "dpr live",
  "crush",
  "heize",
]);

const KNOWN_JP_ARTISTS = new Set([
  "yoasobi",
  "fujii kaze",
  "ado",
  "kenshi yonezu",
  "radwimps",
  "official hige dandism",
  "king gnu",
  "vaundy",
  "aimyon",
  "lisa",
  "aimer",
  "eve",
  "imase",
  "creepy nuts",
  "mrs. green apple",
  "back number",
  "one ok rock",
  "utada hikaru",
  "hikaru utada",
  "joji",
]);

const OTHER_COUNTRIES = new Set([
  "CN",
  "TW",
  "HK",
  "TH",
  "MX",
  "ES",
  "BR",
  "CO",
  "AR",
  "IN",
  "FR",
  "DE",
  "IT",
  "ID",
  "PH",
]);

function normalizeLower(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d");
}

/**
 * 4-Layer Multi-Signal Artist Region & Language Classifier
 * Prioritizes accuracy for Vietnamese artists (including English stage names & empty Spotify genres).
 */
export function classifyArtistRegion(
  signals: ArtistClassificationSignals
): ArtistClassificationResult {
  const rawName = signals.name || "";
  const lowerName = normalizeLower(rawName);
  const asciiName = normalizeLower(stripDiacritics(rawName));

  // LAYER 1: Verified Artists & Curated Regional Dictionaries
  const verified = findVerifiedArtist(rawName, signals.artistId);
  if (verified) {
    return { region: verified.region, language: verified.language };
  }

  if (KNOWN_VN_ARTISTS.has(lowerName) || KNOWN_VN_ARTISTS.has(asciiName)) {
    return { region: "VN", language: "Tiếng Việt" };
  }
  if (KNOWN_KR_ARTISTS.has(lowerName)) {
    return { region: "KR", language: "한국어" };
  }
  if (KNOWN_JP_ARTISTS.has(lowerName)) {
    return { region: "JP", language: "日本語" };
  }

  // LAYER 2: Vietnamese Diacritics, Song/Album Title Analysis, Hangul, Kana
  const titlesJoined = (signals.sampleTitles ?? []).join(" ");
  const allText = `${rawName} ${titlesJoined}`;

  if (
    VIETNAMESE_DIACRITICS.test(rawName) ||
    VIETNAMESE_PHRASE_HINTS.test(rawName)
  ) {
    return { region: "VN", language: "Tiếng Việt" };
  }

  // Check if the artist's discography / track titles contain Vietnamese
  const vnTitleCount = (signals.sampleTitles ?? []).filter(
    (t) => VIETNAMESE_DIACRITICS.test(t) || VIETNAMESE_PHRASE_HINTS.test(t)
  ).length;
  if (vnTitleCount >= 1) {
    return { region: "VN", language: "Tiếng Việt" };
  }

  if (KOREAN_HANGUL.test(allText)) {
    return { region: "KR", language: "한국어" };
  }

  if (JAPANESE_KANA.test(allText)) {
    return { region: "JP", language: "日本語" };
  }

  // LAYER 3: Spotify Genres & YouTube Channel Country
  const genresJoined = (signals.genres ?? []).join(" ").toLowerCase();
  const ytCountry = (signals.youtubeCountry || "").trim().toUpperCase();

  if (
    ytCountry === "VN" ||
    /v-pop|vietnamese|rap viet|vinahouse|nhac tre|indie viet/i.test(
      genresJoined
    )
  ) {
    return { region: "VN", language: "Tiếng Việt" };
  }

  if (
    ytCountry === "KR" ||
    /k-pop|k-rap|k-r&b|k-indie|korean/i.test(genresJoined)
  ) {
    return { region: "KR", language: "한국어" };
  }

  if (
    ytCountry === "JP" ||
    /j-pop|j-rock|anime|vocaloid|japanese|city pop|j-rap/i.test(genresJoined)
  ) {
    return { region: "JP", language: "日本語" };
  }

  if (
    OTHER_COUNTRIES.has(ytCountry) ||
    /latin|reggaeton|urbano latino|c-pop|mandopop|cantopop|thai pop|t-pop|bollywood|afrobeats|french pop|mpb|sertanejo/i.test(
      genresJoined
    )
  ) {
    return { region: "OTHER", language: "Quốc tế khác" };
  }

  // LAYER 4: Default US-UK / Global English
  return { region: "US", language: "English" };
}
