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
  isAboutOpen: boolean;
  autoSkipSponsor: boolean;
  audioOnlyMode: boolean;
  crossfadeDuration: number; // seconds: 0 (off), 2, 3, 5, 8
  setSettingsOpen: (open: boolean) => void;
  toggleSettingsOpen: () => void;
  setAboutOpen: (open: boolean) => void;
  toggleAboutOpen: () => void;
  setAutoSkipSponsor: (enabled: boolean) => void;
  setAudioOnlyMode: (enabled: boolean) => void;
  toggleAudioOnlyMode: () => void;
  setCrossfadeDuration: (seconds: number) => void;
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
      isAboutOpen: false,
      autoSkipSponsor: true,
      audioOnlyMode: false,
      crossfadeDuration: 3,

      setSettingsOpen: (open) => set({ isSettingsOpen: open }),
      toggleSettingsOpen: () =>
        set((s) => ({ isSettingsOpen: !s.isSettingsOpen })),
      setAboutOpen: (open) => set({ isAboutOpen: open }),
      toggleAboutOpen: () => set((s) => ({ isAboutOpen: !s.isAboutOpen })),
      setAutoSkipSponsor: (enabled) => set({ autoSkipSponsor: enabled }),
      setAudioOnlyMode: (enabled) => set({ audioOnlyMode: enabled }),
      toggleAudioOnlyMode: () =>
        set((s) => ({ audioOnlyMode: !s.audioOnlyMode })),
      setCrossfadeDuration: (seconds) =>
        set({ crossfadeDuration: Math.max(0, Math.min(8, Math.round(seconds))) }),

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
        audioOnlyMode: state.audioOnlyMode,
        crossfadeDuration: state.crossfadeDuration,
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
