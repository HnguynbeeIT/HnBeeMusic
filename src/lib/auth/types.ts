import type { RepeatMode, UnifiedTrack } from "@/lib/audio/types";
import type { ApiKeysConfig } from "@/store/useSettingsStore";
import type { UserPlaylist } from "@/store/usePlaylistStore";
import type { FollowedArtist } from "@/store/useArtistStore";

export type AuthMode = "cloud" | "local";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  avatarUrl?: string | null;
  provider?: "google" | "facebook" | "credentials";
  mode: AuthMode;
  createdAt: string;
}

export interface AuthMeResponse {
  mode: AuthMode;
  user: AuthUser | null;
}

export interface ProfileBackupJson {
  version: 1;
  exportedAt: string;
  user: AuthUser | null;
  likedTracks: UnifiedTrack[];
  playlists?: UserPlaylist[];
  followedArtists?: FollowedArtist[];
  playerPrefs: {
    volume: number;
    repeatMode: RepeatMode;
    isShuffle: boolean;
  };
  apiKeys?: Partial<ApiKeysConfig>;
}
