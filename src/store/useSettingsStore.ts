"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ApiKeysConfig {
  youtubeApiKey: string;
  spotifyClientId: string;
  spotifyClientSecret: string;
  soundcloudClientId: string;
}

interface SettingsState extends ApiKeysConfig {
  isSettingsOpen: boolean;
  autoSkipSponsor: boolean;
  setSettingsOpen: (open: boolean) => void;
  toggleSettingsOpen: () => void;
  setAutoSkipSponsor: (enabled: boolean) => void;
  saveKeys: (keys: ApiKeysConfig) => void;
  clearKeys: () => void;
}

const EMPTY_KEYS: ApiKeysConfig = {
  youtubeApiKey: "",
  spotifyClientId: "",
  spotifyClientSecret: "",
  soundcloudClientId: "",
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...EMPTY_KEYS,
      isSettingsOpen: false,
      autoSkipSponsor: true,

      setSettingsOpen: (open) => set({ isSettingsOpen: open }),
      toggleSettingsOpen: () =>
        set((s) => ({ isSettingsOpen: !s.isSettingsOpen })),
      setAutoSkipSponsor: (enabled) => set({ autoSkipSponsor: enabled }),

      saveKeys: (keys) =>
        set({
          youtubeApiKey: keys.youtubeApiKey.trim(),
          spotifyClientId: keys.spotifyClientId.trim(),
          spotifyClientSecret: keys.spotifyClientSecret.trim(),
          soundcloudClientId: keys.soundcloudClientId.trim(),
        }),

      clearKeys: () => set({ ...EMPTY_KEYS }),
    }),
    {
      name: "hnbeemusic-byok-keys",
      partialize: (state) => ({
        youtubeApiKey: state.youtubeApiKey,
        spotifyClientId: state.spotifyClientId,
        spotifyClientSecret: state.spotifyClientSecret,
        soundcloudClientId: state.soundcloudClientId,
        autoSkipSponsor: state.autoSkipSponsor,
      }),
    }
  )
);

/**
 * Builds optional BYOK headers from localStorage-persisted user keys
 * to forward to HnBeeMusic's own Next.js server routes.
 */
export function getByokHeaders(): Record<string, string> {
  const {
    youtubeApiKey,
    spotifyClientId,
    spotifyClientSecret,
    soundcloudClientId,
  } = useSettingsStore.getState();

  const headers: Record<string, string> = {};
  if (youtubeApiKey) {
    headers["x-youtube-key"] = youtubeApiKey;
    headers["x-youtube-api-key"] = youtubeApiKey;
  }
  if (spotifyClientId) {
    headers["x-spotify-id"] = spotifyClientId;
    headers["x-spotify-client-id"] = spotifyClientId;
  }
  if (spotifyClientSecret) {
    headers["x-spotify-secret"] = spotifyClientSecret;
    headers["x-spotify-client-secret"] = spotifyClientSecret;
  }
  if (soundcloudClientId) {
    headers["x-soundcloud-client-id"] = soundcloudClientId;
  }
  return headers;
}
