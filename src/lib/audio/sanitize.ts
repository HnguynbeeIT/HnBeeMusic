import type { TrackSource, UnifiedTrack } from "@/lib/audio/types";
import type { UserPlaylist } from "@/store/usePlaylistStore";
import type { FollowedArtist } from "@/store/useArtistStore";

const VALID_SOURCES = new Set<TrackSource>([
  "youtube",
  "soundcloud",
  "spotify",
  "zingmp3",
  "nhaccuatui",
  "apple_music",
  "audius",
]);

export function safeDecodeParam(raw?: string | string[] | null): string {
  const str = Array.isArray(raw) ? raw[0] || "" : raw || "";
  if (!str) return "";
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

export function sanitizeTrack(input: unknown): UnifiedTrack | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const id = typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : "";
  if (!id) return null;

  const rawSource = obj.source as TrackSource;
  const source: TrackSource = VALID_SOURCES.has(rawSource)
    ? rawSource
    : "youtube";

  const rawDuration = Number(obj.duration);
  const duration =
    Number.isFinite(rawDuration) && rawDuration >= 0 ? rawDuration : 0;

  return {
    id,
    title:
      typeof obj.title === "string" && obj.title.trim()
        ? obj.title
        : "Untitled Track",
    artist:
      typeof obj.artist === "string" && obj.artist.trim()
        ? obj.artist
        : "Unknown Artist",
    thumbnail: typeof obj.thumbnail === "string" ? obj.thumbnail : "",
    duration,
    source,
    sourceUrl: typeof obj.sourceUrl === "string" ? obj.sourceUrl : "",
    ...(typeof obj.streamUrl === "string" && obj.streamUrl
      ? { streamUrl: obj.streamUrl }
      : {}),
    ...(obj.resolvedSource === "youtube" ||
    obj.resolvedSource === "soundcloud" ||
    obj.resolvedSource === "zingmp3"
      ? { resolvedSource: obj.resolvedSource }
      : {}),
    ...(obj.isSnippet === true ? { isSnippet: true } : {}),
  };
}

export function sanitizeTracks(input: unknown): UnifiedTrack[] {
  if (!Array.isArray(input)) return [];
  const out: UnifiedTrack[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    const clean = sanitizeTrack(item);
    if (clean && !seen.has(clean.id)) {
      seen.add(clean.id);
      out.push(clean);
    }
  }
  return out;
}

export function sanitizePlaylists(input: unknown): UserPlaylist[] {
  if (!Array.isArray(input)) return [];
  const now = new Date().toISOString();
  const out: UserPlaylist[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const id =
      typeof obj.id === "string" && obj.id.trim()
        ? obj.id.trim()
        : `upl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    out.push({
      id,
      name:
        typeof obj.name === "string" && obj.name.trim()
          ? obj.name.trim()
          : "Playlist mới",
      ...(typeof obj.description === "string" && obj.description.trim()
        ? { description: obj.description.trim() }
        : {}),
      ...(typeof obj.coverUrl === "string" && obj.coverUrl.trim()
        ? { coverUrl: obj.coverUrl.trim() }
        : {}),
      tracks: sanitizeTracks(obj.tracks),
      createdAt:
        typeof obj.createdAt === "string" && obj.createdAt
          ? obj.createdAt
          : now,
      updatedAt:
        typeof obj.updatedAt === "string" && obj.updatedAt
          ? obj.updatedAt
          : now,
    });
  }

  return out;
}

export function sanitizeFollowedArtists(input: unknown): FollowedArtist[] {
  if (!Array.isArray(input)) return [];
  const now = new Date().toISOString();
  const out: FollowedArtist[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const name =
      typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : "";
    const id =
      typeof obj.id === "string" && obj.id.trim()
        ? obj.id.trim()
        : name.toLowerCase();
    if (!id || !name || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());

    const rawSource = obj.primarySource as TrackSource;
    out.push({
      id,
      name,
      avatar: typeof obj.avatar === "string" ? obj.avatar : "",
      primarySource: VALID_SOURCES.has(rawSource) ? rawSource : "spotify",
      followedAt:
        typeof obj.followedAt === "string" && obj.followedAt
          ? obj.followedAt
          : now,
    });
  }

  return out;
}
