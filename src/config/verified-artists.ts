import type { ArtistRegion } from "@/lib/audio/region";

export interface VerifiedArtistConfig {
  id: string;
  aliases: string[];
  trackAliases?: string[];
  displayName: string;
  verified: boolean;
  featured?: boolean;
  region: ArtistRegion;
  language: string;
  genres: string[];
  bio: string;
  defaultAvatar: string;
  platforms: {
    spotify?: {
      id: string;
      url: string;
    };
    youtube?: {
      handle: string;
      url: string;
    };
    soundcloud?: {
      permalink: string;
      url: string;
    };
    wiki?: {
      label: string;
      url: string;
    };
  };
}

export interface DirectoryArtistItem {
  id: string;
  name: string;
  subtitle: string;
  region: ArtistRegion;
  language: string;
  verified?: boolean;
  avatar: string;
  spotifyId?: string;
  genres: string[];
}

export const VERIFIED_ARTISTS: VerifiedArtistConfig[] = [
  {
    id: "verified:guyn",
    aliases: ["guyn", "guyn official", "guyn offical", "hnbeestudio", "bee"],
    trackAliases: ["Guyn", "Guyn Official", "Guyn Offical", "Guyn Music", "HnBeeStudio"],
    displayName: "Guyn",
    verified: true,
    featured: true,
    region: "VN",
    language: "Tiếng Việt",
    genres: ["Rap Việt", "Melodic Rap", "Hip-Hop", "Indie"],
    bio: "Nghệ sĩ Rap/Hip-Hop độc lập, Music Producer & Nhà sáng lập HnBeeStudio.",
    defaultAvatar:
      "https://i.scdn.co/image/ab6761610000e5eb52b24141d997f98dfbfce393",
    platforms: {
      spotify: {
        id: "0CRoV4IrXoKZKugQ2HBjjr",
        url: "https://open.spotify.com/intl-vi/artist/0CRoV4IrXoKZKugQ2HBjjr",
      },
      youtube: {
        handle: "@HnBeeStudio",
        url: "https://www.youtube.com/@HnBeeStudio",
      },
      soundcloud: {
        permalink: "guyn-music",
        url: "https://soundcloud.com/guyn-music/tracks",
      },
      wiki: {
        label: "Rapviet Wiki",
        url: "https://rapviet.fandom.com/vi/wiki/Guyn",
      },
    },
  },
];

export const DIRECTORY_ARTISTS: DirectoryArtistItem[] = [
  // Việt Nam (Tiếng Việt) — Guyn pinned #1
  {
    id: "verified:guyn",
    name: "Guyn",
    subtitle: "Rap Việt · HnBeeStudio",
    region: "VN",
    language: "Tiếng Việt",
    verified: true,
    avatar:
      "https://i.scdn.co/image/ab6761610000e5eb52b24141d997f98dfbfce393",
    spotifyId: "0CRoV4IrXoKZKugQ2HBjjr",
    genres: ["Rap Việt", "Melodic Rap", "Indie"],
  },
  {
    id: "dir:sontung",
    name: "Sơn Tùng M-TP",
    subtitle: "V-Pop · Pop",
    region: "VN",
    language: "Tiếng Việt",
    verified: true,
    avatar:
      "https://i.scdn.co/image/ab6761610000e5eb8885185d1e914c51c15c3a13",
    genres: ["V-Pop", "Pop"],
  },
  {
    id: "dir:mck",
    name: "RPT MCK",
    subtitle: "Rap Việt · Hip-Hop",
    region: "VN",
    language: "Tiếng Việt",
    verified: true,
    avatar:
      "https://i.scdn.co/image/ab6761610000e5eb4a4c1d593a7b6c6a0d2f0c55",
    genres: ["Rap Việt", "Hip-Hop"],
  },
  {
    id: "dir:den",
    name: "Đen",
    subtitle: "Rap Việt · Indie",
    region: "VN",
    language: "Tiếng Việt",
    verified: true,
    avatar:
      "https://i.scdn.co/image/ab6761610000e5eb0c68f6c95232e716f0abee8d",
    genres: ["Rap Việt", "Indie"],
  },

  // Quốc tế (US-UK • English)
  {
    id: "dir:theweeknd",
    name: "The Weeknd",
    subtitle: "R&B · Synth-Pop",
    region: "US",
    language: "English",
    verified: true,
    avatar:
      "https://i.scdn.co/image/ab6761610000e5eb9e528993a2820267b97f6aae",
    genres: ["R&B", "Pop"],
  },
  {
    id: "dir:daftpunk",
    name: "Daft Punk",
    subtitle: "Electronic · French House",
    region: "US",
    language: "English",
    verified: true,
    avatar:
      "https://i.scdn.co/image/ab6761610000e5eba7bfd7835b5c1eee0c95fa6e",
    genres: ["Electronic", "House"],
  },
  {
    id: "dir:odesza",
    name: "ODESZA",
    subtitle: "Chillwave · Electronic",
    region: "US",
    language: "English",
    verified: true,
    avatar:
      "https://i.scdn.co/image/ab6761610000e5eb2a3b647d908f0c857690f5c4",
    genres: ["Electronic", "Indie"],
  },

  // Hàn Quốc (K-Pop • 한국어)
  {
    id: "dir:bts",
    name: "BTS",
    subtitle: "K-Pop · Hip-Hop",
    region: "KR",
    language: "한국어",
    verified: true,
    avatar:
      "https://i.scdn.co/image/ab6761610000e5ebd642648235ebf3460d2d1f6a",
    genres: ["K-Pop", "Pop"],
  },
  {
    id: "dir:blackpink",
    name: "BLACKPINK",
    subtitle: "K-Pop · Dance",
    region: "KR",
    language: "한국어",
    verified: true,
    avatar:
      "https://i.scdn.co/image/ab6761610000e5ebc9690bc711d04b3d4fd4b87c",
    genres: ["K-Pop", "Hip-Hop"],
  },
  {
    id: "dir:newjeans",
    name: "NewJeans",
    subtitle: "K-Pop · Y2K R&B",
    region: "KR",
    language: "한국어",
    verified: true,
    avatar:
      "https://i.scdn.co/image/ab6761610000e5eb80668ba2b15094d083780ea9",
    genres: ["K-Pop", "R&B"],
  },

  // Nhật Bản (J-Pop • 日本語)
  {
    id: "dir:yoasobi",
    name: "YOASOBI",
    subtitle: "J-Pop · Anime",
    region: "JP",
    language: "日本語",
    verified: true,
    avatar:
      "https://i.scdn.co/image/ab6761610000e5ebbf7766702819866466d04207",
    genres: ["J-Pop", "Anime"],
  },
  {
    id: "dir:fujiikaze",
    name: "Fujii Kaze",
    subtitle: "J-Pop · R&B Soul",
    region: "JP",
    language: "日本語",
    verified: true,
    avatar:
      "https://i.scdn.co/image/ab6761610000e5eb4853b311359632c967477558",
    genres: ["J-Pop", "R&B"],
  },
  {
    id: "dir:ado",
    name: "Ado",
    subtitle: "J-Pop · J-Rock",
    region: "JP",
    language: "日本語",
    verified: true,
    avatar:
      "https://i.scdn.co/image/ab6761610000e5eb2286697276511c727319d5a0",
    genres: ["J-Pop", "J-Rock"],
  },
];

function normalizeAlias(input: string): string {
  return input
    .trim()
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function findVerifiedArtist(
  name?: string,
  artistId?: string
): VerifiedArtistConfig | null {
  const cleanId = (artistId || "").trim();
  const cleanName = normalizeAlias(name || "");

  for (const artist of VERIFIED_ARTISTS) {
    if (cleanId && artist.platforms.spotify?.id === cleanId) {
      return artist;
    }
    if (cleanName && artist.aliases.includes(cleanName)) {
      return artist;
    }
  }
  return null;
}
