export type ParsedMusicUrl =
  | { source: "youtube"; resourceType: "track"; id: string; url: string }
  | { source: "youtube"; resourceType: "playlist"; id: string; url: string }
  | { source: "soundcloud"; resourceType: "track"; url: string }
  | {
      source: "spotify";
      resourceType: "track" | "playlist" | "album" | "artist";
      id: string;
      url: string;
    };

const YOUTUBE_PLAYLIST_REGEX =
  /(?:https?:\/\/)?(?:www\.|m\.|music\.)?youtube\.com\/playlist\?(?:.*&)?list=([a-zA-Z0-9_-]+)/i;

const YOUTUBE_VIDEO_REGEX =
  /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

const SPOTIFY_REGEX =
  /(?:https?:\/\/)?open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|playlist|album|artist)\/([a-zA-Z0-9]+)/i;

const SOUNDCLOUD_REGEX =
  /(?:https?:\/\/)?(?:www\.|m\.)?(?:soundcloud\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+|on\.soundcloud\.com\/[a-zA-Z0-9]+)/i;

export function parseMusicUrl(input: string): ParsedMusicUrl | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const ytPlaylistMatch = trimmed.match(YOUTUBE_PLAYLIST_REGEX);
  if (ytPlaylistMatch?.[1]) {
    return {
      source: "youtube",
      resourceType: "playlist",
      id: ytPlaylistMatch[1],
      url: `https://www.youtube.com/playlist?list=${ytPlaylistMatch[1]}`,
    };
  }

  const ytMatch = trimmed.match(YOUTUBE_VIDEO_REGEX);
  if (ytMatch?.[1]) {
    return {
      source: "youtube",
      resourceType: "track",
      id: ytMatch[1],
      url: `https://www.youtube.com/watch?v=${ytMatch[1]}`,
    };
  }

  const spMatch = trimmed.match(SPOTIFY_REGEX);
  if (spMatch?.[1] && spMatch?.[2]) {
    const resourceType = spMatch[1].toLowerCase() as
      | "track"
      | "playlist"
      | "album"
      | "artist";
    return {
      source: "spotify",
      resourceType,
      id: spMatch[2],
      url: `https://open.spotify.com/${resourceType}/${spMatch[2]}`,
    };
  }

  const scMatch = trimmed.match(SOUNDCLOUD_REGEX);
  if (scMatch) {
    const normalizedUrl = trimmed.startsWith("http")
      ? trimmed
      : `https://${trimmed}`;
    return {
      source: "soundcloud",
      resourceType: "track",
      url: normalizedUrl,
    };
  }

  return null;
}

export function extractYouTubeId(urlOrId: string): string | null {
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId;
  const match = urlOrId.match(YOUTUBE_VIDEO_REGEX);
  return match?.[1] ?? null;
}
