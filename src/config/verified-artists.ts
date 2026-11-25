export interface VerifiedArtistConfig {
  id: string;
  aliases: string[];
  displayName: string;
  verified: boolean;
  featured?: boolean;
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

export const VERIFIED_ARTISTS: VerifiedArtistConfig[] = [
  {
    id: "verified:guyn",
    aliases: ["guyn", "guyn official", "guyn offical", "hnbeestudio", "bee"],
    displayName: "Guyn",
    verified: true,
    featured: true,
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
