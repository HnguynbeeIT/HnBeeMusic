/**
 * Strict Title & Artist Matching Engine for Spotify -> YouTube / SoundCloud / Audius
 * Guarantees zero blind `results[0]` fallbacks and full Vietnamese diacritic-insensitive matching.
 */

export const STRICT_NOISE_KEYWORDS = [
  "remix",
  "cover",
  "karaoke",
  "beat",
  "instrumental",
  "reaction",
  "8d",
  "nightcore",
  "sped up",
  "speed up",
  "slowed",
  "mashup",
  "nhac che",
  "nonstop",
];

/**
 * Normalizes Vietnamese & Latin strings into lowercase accent-free alphanumeric text.
 * Example: "Được yêu" -> "duoc yeu", "Già Cùng Nhau Là Được" -> "gia cung nhau la duoc"
 */
export function normalizeStr(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strips trailing/parenthetical metadata from Spotify track titles for search & matching
 * while preserving the core song name (never mutates displayed UI title).
 * Example: "Heroes Tonight (feat. Johnning)" -> "Heroes Tonight"
 */
export function cleanSearchTitle(title: string): string {
  const cleaned = (title || "")
    .replace(/\u00a0/g, " ")
    // Remove parenthetical/bracketed feat/ft/prod/remaster/official/edition suffixes
    .replace(
      /\s*[\(\[](?:feat\.?|ft\.?|with|prod\.?|official|remaster(?:ed)?|radio edit|audiophile|original mix|lyric(?:s)?|audio|mv|music video|explicit|clean|version)[^\)\]]*[\)\]]/gi,
      ""
    )
    // Remove unbracketed trailing feat./ft./prod.
    .replace(/\s+(?:feat\.?|ft\.?|prod\.?\s*by)\s+.+$/i, "")
    // Remove trailing "- Remastered 2023" / "- Official Audio" / "- Single Version"
    .replace(
      /\s+[-–—]\s+(?:remaster(?:ed)?|official|radio edit|single version|album version|acoustic|live|bonus track).*$/i,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || (title || "").trim();
}

/**
 * Splits a combined Spotify artist string ("The Wind, Ronboogz") into individual artists.
 */
export function extractArtists(artist: string): string[] {
  return (artist || "")
    .split(/\s*(?:,|&|·|;|feat\.?|ft\.?|\bx\b)\s*/i)
    .map((a) => a.trim())
    .filter((a) => a.length > 0 && !/^(unknown artist|spotify)$/i.test(a));
}

export function extractPrimaryArtist(artist: string): string {
  return extractArtists(artist)[0] || (artist || "").trim();
}

export interface MatchCandidateInput {
  title: string;
  artist: string; // Channel name / uploader / artist
  duration: number; // seconds (0 if unknown)
}

export interface TargetTrackInput {
  title: string;
  artist: string;
  duration: number; // seconds (0 if unknown)
}

/**
 * Strict Candidate Scorer (`scoreCandidate`):
 * - HARD REQUIREMENT: Candidate title (accent-free) MUST contain `cleanTitle` (accent-free).
 *   If not -> returns `-999` immediately (strictly forbids blind `results[0]` selection!).
 * - +50 if candidate title or channel contains artist name (`primaryArtist` or collaborating artist).
 * - +30 if duration delta <= 35s; -100 if duration delta > 60s.
 * - -80 per noise keyword (`remix`, `cover`, `karaoke`, `beat`, `instrumental`, `reaction`, `8d`,
 *   `nightcore`, `sped up`, `slowed`, `mashup`, `nhac che`) not present in the original Spotify title.
 * - Only candidates with `score > 0` are eligible!
 */
export function scoreCandidate(
  candidate: MatchCandidateInput,
  target: TargetTrackInput
): number {
  const cleanTitle = cleanSearchTitle(target.title);
  const cleanTitleNorm = normalizeStr(cleanTitle) || normalizeStr(target.title);
  const origTitleNorm = normalizeStr(target.title);
  const candTitleNorm = normalizeStr(candidate.title);
  const candArtistNorm = normalizeStr(candidate.artist);

  // HARD REQUIREMENT: Candidate title MUST contain cleanTitle (diacritic-insensitive)
  if (!cleanTitleNorm || !candTitleNorm.includes(cleanTitleNorm)) {
    return -999;
  }

  let score = 15; // Base score for passing strict title containment

  // 1. Artist match (+50) — matches either full normalized artist or compact handle (e.g. "tung tea" vs "tungtea")
  const artists = extractArtists(target.artist);
  const primaryArtistNorm = normalizeStr(extractPrimaryArtist(target.artist));
  const candCombinedNorm = `${candTitleNorm} ${candArtistNorm}`;
  const candCombinedCompact = candCombinedNorm.replace(/\s+/g, "");

  let artistMatched = false;
  if (primaryArtistNorm.length >= 2) {
    const primaryCompact = primaryArtistNorm.replace(/\s+/g, "");
    if (
      candCombinedNorm.includes(primaryArtistNorm) ||
      (primaryCompact.length >= 4 && candCombinedCompact.includes(primaryCompact))
    ) {
      artistMatched = true;
    }
  }
  if (!artistMatched && artists.length > 1) {
    for (const art of artists.slice(1)) {
      const artNorm = normalizeStr(art);
      const artCompact = artNorm.replace(/\s+/g, "");
      if (
        artNorm.length >= 2 &&
        (candCombinedNorm.includes(artNorm) ||
          (artCompact.length >= 4 && candCombinedCompact.includes(artCompact)))
      ) {
        artistMatched = true;
        break;
      }
    }
  }

  if (artistMatched) {
    score += 50;
  } else if (artists.length > 0) {
    // Penalize unrelated artist covering/sharing a generic title
    score -= 35;
  }

  // 2. Duration proximity (+30 if <= 35s, -100 if > 60s)
  if (target.duration > 0 && candidate.duration > 0) {
    const diff = Math.abs(candidate.duration - target.duration);
    if (diff <= 35) {
      score += 30;
    } else if (diff > 60) {
      score -= 100;
    }
  }

  // 3. Noise keyword penalty (-80) unless present in original Spotify track title
  for (const kw of STRICT_NOISE_KEYWORDS) {
    if (candTitleNorm.includes(kw) && !origTitleNorm.includes(kw)) {
      score -= 80;
    }
  }

  // 4. Clean tie-breakers (Official Audio / Topic > Lyrics > Official MV)
  const candArtistLower = (candidate.artist || "").toLowerCase();
  if (
    candArtistLower.endsWith(" - topic") ||
    candTitleNorm.includes("official audio")
  ) {
    score += 15;
  } else if (
    candTitleNorm.includes("lyric") ||
    candTitleNorm.includes("official mv") ||
    candTitleNorm.includes("official music video") ||
    candTitleNorm.includes("official video")
  ) {
    score += 10;
  }

  return score;
}
