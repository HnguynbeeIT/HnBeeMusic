import type { RepeatMode, UnifiedTrack } from "@/lib/audio/types";
import type { ApiKeysConfig } from "@/store/useSettingsStore";
import type { UserPlaylist } from "@/store/usePlaylistStore";

export type AuthMode = "cloud" | "local";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
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
  playerPrefs: {
    volume: number;
    repeatMode: RepeatMode;
    isShuffle: boolean;
  };
  apiKeys?: Partial<ApiKeysConfig>;
}
