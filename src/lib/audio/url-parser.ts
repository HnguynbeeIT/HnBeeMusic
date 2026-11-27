export type ParsedMusicUrl =
  | { source: "youtube"; resourceType: "track"; id: string; url: string }
  | { source: "youtube"; resourceType: "playlist"; id: string; url: string }
  | { source: "soundcloud"; resourceType: "track"; url: string }
  | {
      source: "spotify";
      resourceType: "track" | "playlist" | "album" | "artist";
      id: string;
      url: string;
    }
  | {
      source: "zingmp3";
      resourceType: "track" | "playlist";
      id: string;
      url: string;
    }
  | {
      source: "nhaccuatui";
      resourceType: "track" | "playlist";
      id: string;
      url: string;
    }
  | {
      source: "apple_music";
      resourceType: "track" | "album" | "playlist";
      id: string;
      storefront: string;
      url: string;
    }
  | {
      source: "audius";
      resourceType: "track" | "playlist";
      url: string;
    };

const YOUTUBE_PLAYLIST_REGEX =
  /(?:https?:\/\/)?(?:www\.|m\.|music\.)?youtube\.com\/playlist\?(?:.*&)?list=([a-zA-Z0-9_-]+)/i;

const YOUTUBE_VIDEO_REGEX =
  /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

const SPOTIFY_URL_REGEX =
  /(?:https?:\/\/)?(?:open|play)\.spotify\.com\/(?:(?:intl-[a-z]{2}(?:-[a-z]{2})?|embed|user\/[^/?#]+)\/)*(track|playlist|album|artist)\/([a-zA-Z0-9]+)/i;

const SPOTIFY_URI_REGEX =
  /^spotify:(track|playlist|album|artist):([a-zA-Z0-9]+)$/i;

const SOUNDCLOUD_REGEX =
  /(?:https?:\/\/)?(?:www\.|m\.)?(?:soundcloud\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+|on\.soundcloud\.com\/[a-zA-Z0-9]+)/i;

const ZINGMP3_TRACK_REGEX =
  /(?:https?:\/\/)?(?:www\.|m\.)?zingmp3\.vn\/bai-hat\/[^/?#]+\/([a-zA-Z0-9]+)\.html/i;

const ZINGMP3_PLAYLIST_REGEX =
  /(?:https?:\/\/)?(?:www\.|m\.)?zingmp3\.vn\/(?:album|playlist)\/[^/?#]+\/([a-zA-Z0-9]+)\.html/i;

const NCT_TRACK_REGEX =
  /(?:https?:\/\/)?(?:www\.|m\.)?nhaccuatui\.com\/bai-hat\/[^/?#]*\.([a-zA-Z0-9]+)\.html/i;

const NCT_PLAYLIST_REGEX =
  /(?:https?:\/\/)?(?:www\.|m\.)?nhaccuatui\.com\/playlist\/[^/?#]*\.([a-zA-Z0-9]+)\.html/i;

const APPLE_MUSIC_PLAYLIST_REGEX =
  /(?:https?:\/\/)?music\.apple\.com\/([a-z]{2})\/playlist\/[^/?#]+\/(pl\.[a-zA-Z0-9._-]+)/i;

const APPLE_MUSIC_SONG_REGEX =
  /(?:https?:\/\/)?music\.apple\.com\/([a-z]{2})\/song\/[^/?#]+\/(\d+)/i;

const APPLE_MUSIC_ALBUM_REGEX =
  /(?:https?:\/\/)?music\.apple\.com\/([a-z]{2})\/album\/[^/?#]+\/(\d+)(?:\?.*i=(\d+))?/i;

const AUDIUS_REGEX =
  /(?:https?:\/\/)?(?:www\.)?audius\.co\/([a-zA-Z0-9_.-]+)\/([^/?#]+(?:\/[^/?#]+)?)/i;

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

  const spMatch =
    trimmed.match(SPOTIFY_URL_REGEX) || trimmed.match(SPOTIFY_URI_REGEX);
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

  const zingTrack = trimmed.match(ZINGMP3_TRACK_REGEX);
  if (zingTrack?.[1]) {
    return {
      source: "zingmp3",
      resourceType: "track",
      id: zingTrack[1],
      url: trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    };
  }

  const zingPlaylist = trimmed.match(ZINGMP3_PLAYLIST_REGEX);
  if (zingPlaylist?.[1]) {
    return {
      source: "zingmp3",
      resourceType: "playlist",
      id: zingPlaylist[1],
      url: trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    };
  }

  const nctTrack = trimmed.match(NCT_TRACK_REGEX);
  if (nctTrack?.[1]) {
    return {
      source: "nhaccuatui",
      resourceType: "track",
      id: nctTrack[1],
      url: trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    };
  }

  const nctPlaylist = trimmed.match(NCT_PLAYLIST_REGEX);
  if (nctPlaylist?.[1]) {
    return {
      source: "nhaccuatui",
      resourceType: "playlist",
      id: nctPlaylist[1],
      url: trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    };
  }

  const applePlaylist = trimmed.match(APPLE_MUSIC_PLAYLIST_REGEX);
  if (applePlaylist?.[1] && applePlaylist?.[2]) {
    return {
      source: "apple_music",
      resourceType: "playlist",
      storefront: applePlaylist[1].toLowerCase(),
      id: applePlaylist[2],
      url: trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    };
  }

  const appleSong = trimmed.match(APPLE_MUSIC_SONG_REGEX);
  if (appleSong?.[1] && appleSong?.[2]) {
    return {
      source: "apple_music",
      resourceType: "track",
      storefront: appleSong[1].toLowerCase(),
      id: appleSong[2],
      url: trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    };
  }

  const appleAlbum = trimmed.match(APPLE_MUSIC_ALBUM_REGEX);
  if (appleAlbum?.[1] && appleAlbum?.[2]) {
    const trackId = appleAlbum[3];
    return {
      source: "apple_music",
      resourceType: trackId ? "track" : "album",
      storefront: appleAlbum[1].toLowerCase(),
      id: trackId || appleAlbum[2],
      url: trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    };
  }

  const audiusMatch = trimmed.match(AUDIUS_REGEX);
  if (audiusMatch) {
    const normalizedUrl = trimmed.startsWith("http")
      ? trimmed
      : `https://${trimmed}`;
    return {
      source: "audius",
      resourceType: /\/playlist\//i.test(normalizedUrl) ? "playlist" : "track",
      url: normalizedUrl,
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
