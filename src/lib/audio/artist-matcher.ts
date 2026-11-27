import type { UnifiedTrack } from "@/lib/audio/types";

export interface ArtistMatchTrack {
  id?: string;
  title: string;
  artist?: string;
  artists?: string[];
  featuredArtists?: string[];
  uploader?: string;
  channel?: string;
  user?: string | { username?: string; name?: string };
}

const PLATFORM_SUFFIX_RE =
  /(?:\s*[-–—]\s*topic|\s+vevo|\s+official\s+(?:music\s+)?channel|\s+official\s+music|\s+music\s+official|\s+official|\s+offical|\s+channel|\s+music)$/i;

const TRAILING_TAG_RE =
  /\s*(?:\([^)]*(?:official|audio|video|mv|lyric|lyrics|visualizer|remaster|remix|edit|live|hd|4k|ver|version)[^)]*\)|\[[^\]]*\])\s*$/gi;

const ARTIST_SPLIT_RE =
  /\s*(?:,|;|&|\/|•|\||\+|、|＆|\b(?:feat\.?|ft\.?|featuring|with|vs\.?|prod\.?(?:\s+by)?|produced\s+by)\b)\s*|\s+[x×]\s+/gi;

const TITLE_CREDIT_RE =
  /(?:^|[\s(\[|])(?:feat\.?|ft\.?|featuring|with|prod\.?(?:\s+by)?|produced\s+by)\s+([^()\[\]|–—-]+?)(?=$|[\)\]|–—-])/gi;

function foldDiacritics(input: string): string {
  return input
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeArtistText(raw: string): string {
  return foldDiacritics(raw)
    .toLowerCase()
    .replace(/[º°]/g, " ")
    .replace(/[^a-z0-9\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPlatformSuffixes(raw: string): string {
  let current = raw.trim();
  for (let i = 0; i < 3; i += 1) {
    const next = current.replace(PLATFORM_SUFFIX_RE, "").trim();
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

function stripTrailingMediaTags(raw: string): string {
  let current = raw.trim();
  for (let i = 0; i < 3; i += 1) {
    const next = current.replace(TRAILING_TAG_RE, "").trim();
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

function addCanonicalVariants(raw: string, out: Set<string>): void {
  const cleaned = raw.trim().replace(/^@/, "");
  if (!cleaned) return;

  const variants = [cleaned, stripPlatformSuffixes(cleaned)];
  for (const variant of variants) {
    const normalized = normalizeArtistText(variant);
    if (normalized) out.add(normalized);

    if (/[a-z0-9]-[a-z0-9]/i.test(variant)) {
      const hyphenJoined = normalizeArtistText(
        variant.replace(/([a-z0-9])-([a-z0-9])/gi, "$1$2")
      );
      if (hyphenJoined && hyphenJoined.split(" ").length >= 2) {
        out.add(hyphenJoined);
      }
    }
  }
}

export function splitArtistCredits(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const results = new Set<string>();
  results.add(trimmed);

  const unwrapped = trimmed.replace(/[()\[\]]/g, " ");
  for (const part of unwrapped.split(ARTIST_SPLIT_RE)) {
    const piece = part.trim();
    if (piece) results.add(piece);
  }

  return Array.from(results);
}

function extractTitleArtistCredits(title: string): {
  primaryCredits: string[];
  suffixCredits: string[];
} {
  const trimmed = title.trim();
  if (!trimmed) return { primaryCredits: [], suffixCredits: [] };

  const primaryCredits: string[] = [];
  const suffixCredits: string[] = [];

  TITLE_CREDIT_RE.lastIndex = 0;
  let match: RegExpExecArray | null = TITLE_CREDIT_RE.exec(trimmed);
  while (match !== null) {
    const captured = stripTrailingMediaTags(match[1] || "");
    if (captured) primaryCredits.push(...splitArtistCredits(captured));
    match = TITLE_CREDIT_RE.exec(trimmed);
  }

  const pipeSegments = trimmed
    .split(/\s*\|+\s*/)
    .map((s) => stripTrailingMediaTags(s))
    .filter(Boolean);

  for (const segment of pipeSegments) {
    const dashParts = segment.split(/\s+[-–—]\s+/);
    if (dashParts.length >= 2) {
      const left = stripTrailingMediaTags(dashParts[0] || "");
      const right = stripTrailingMediaTags(
        dashParts[dashParts.length - 1] || ""
      );
      if (left) primaryCredits.push(...splitArtistCredits(left));
      if (right) suffixCredits.push(...splitArtistCredits(right));
    } else if (pipeSegments.length > 1) {
      primaryCredits.push(...splitArtistCredits(segment));
    }
  }

  return { primaryCredits, suffixCredits };
}

export function buildArtistCanonicalKeys(
  artistName: string,
  aliases: readonly string[] = []
): Set<string> {
  const keys = new Set<string>();
  addCanonicalVariants(artistName, keys);
  for (const alias of aliases) {
    addCanonicalVariants(alias, keys);
  }
  return keys;
}

function matchesAnyTargetKey(
  candidate: string,
  targetKeys: ReadonlySet<string>,
  minWords: number = 1
): boolean {
  const candidateKeys = new Set<string>();
  for (const credit of splitArtistCredits(candidate)) {
    addCanonicalVariants(credit, candidateKeys);
  }
  for (const key of candidateKeys) {
    if (targetKeys.has(key) && key.split(" ").length >= minWords) return true;
  }
  return false;
}

export function isTrackByArtist(
  track: ArtistMatchTrack,
  artistName: string,
  aliases: readonly string[] = []
): boolean {
  const targetKeys = buildArtistCanonicalKeys(artistName, aliases);
  if (targetKeys.size === 0) return false;

  const directCandidates: string[] = [];
  if (track.artist) directCandidates.push(track.artist);
  if (Array.isArray(track.artists)) {
    for (const name of track.artists) {
      if (name) directCandidates.push(name);
    }
  }
  if (Array.isArray(track.featuredArtists)) {
    for (const name of track.featuredArtists) {
      if (name) directCandidates.push(name);
    }
  }
  if (track.uploader) directCandidates.push(track.uploader);
  if (track.channel) directCandidates.push(track.channel);
  if (typeof track.user === "string") {
    directCandidates.push(track.user);
  } else if (track.user) {
    if (track.user.username) directCandidates.push(track.user.username);
    if (track.user.name) directCandidates.push(track.user.name);
  }

  for (const candidate of directCandidates) {
    if (matchesAnyTargetKey(candidate, targetKeys)) {
      return true;
    }
  }

  if (track.title) {
    const { primaryCredits, suffixCredits } = extractTitleArtistCredits(
      track.title
    );
    for (const titleCredit of primaryCredits) {
      if (matchesAnyTargetKey(titleCredit, targetKeys)) {
        return true;
      }
    }
    for (const suffixCredit of suffixCredits) {
      if (matchesAnyTargetKey(suffixCredit, targetKeys, 2)) {
        return true;
      }
    }
  }

  return false;
}

export function normalizeTrackDedupTitle(title: string): string {
  return foldDiacritics(title)
    .toLowerCase()
    .replace(
      /\s*\([^)]*(?:official|audio|video|mv|lyric|lyrics|feat\.|ft\.|prod\.|visualizer|hd|4k)[^)]*\)/gi,
      ""
    )
    .replace(/\s*\[[^\]]*\]/g, "")
    .replace(/[^a-z0-9\p{L}\p{N}]/gu, "");
}

export function deduplicateArtistTracks(
  tracks: readonly UnifiedTrack[],
  scope: "per-source" | "global" = "per-source"
): UnifiedTrack[] {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const result: UnifiedTrack[] = [];

  for (const track of tracks) {
    if (track.id && seenIds.has(track.id)) continue;

    const normTitle = normalizeTrackDedupTitle(track.title);
    const normArtist = normalizeArtistText(track.artist);
    const dedupKey =
      scope === "global"
        ? normTitle || `${track.source}:${track.id}`
        : `${track.source}:${normTitle}:${normArtist}`;

    if (dedupKey && seenKeys.has(dedupKey)) continue;

    if (track.id) seenIds.add(track.id);
    if (dedupKey) seenKeys.add(dedupKey);
    result.push(track);
  }

  return result;
}
