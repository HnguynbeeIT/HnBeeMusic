"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AuthMeResponse,
  AuthMode,
  AuthUser,
  ProfileBackupJson,
} from "@/lib/auth/types";
import {
  normalizeUsername,
  validatePassword,
  validateUsername,
} from "@/lib/auth/validation";
import { usePlayerStore } from "./usePlayerStore";
import { useSettingsStore } from "./useSettingsStore";
import { usePlaylistStore } from "./usePlaylistStore";
import { useArtistStore } from "./useArtistStore";

interface LocalAccountRecord {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
}

interface AuthActionResult {
  ok: boolean;
  error?: string;
}

interface AuthState {
  user: AuthUser | null;
  authMode: AuthMode;
  initialized: boolean;
  isAuthModalOpen: boolean;
  localAccounts: LocalAccountRecord[];

  setAuthModalOpen: (open: boolean) => void;
  initAuth: () => Promise<void>;
  register: (params: {
    username: string;
    displayName?: string;
    password: string;
  }) => Promise<AuthActionResult>;
  login: (params: {
    username: string;
    password: string;
  }) => Promise<AuthActionResult>;
  logout: () => Promise<void>;
  exportProfileJson: () => string;
  importProfileJson: (raw: string) => AuthActionResult;
}

async function hashLocalPassword(
  username: string,
  password: string
): Promise<string> {
  const input = `hnbee-local-v1:${username}:${password}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return btoa(unescape(encodeURIComponent(input)));
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      authMode: "local",
      initialized: false,
      isAuthModalOpen: false,
      localAccounts: [],

      setAuthModalOpen: (open) => set({ isAuthModalOpen: open }),

      initAuth: async () => {
        if (get().initialized) return;
        try {
          const res = await fetch("/api/auth/me", { cache: "no-store" });
          const data = (await res.json()) as AuthMeResponse;
          if (data.mode === "cloud") {
            set({
              authMode: "cloud",
              user: data.user,
              initialized: true,
            });
            if (data.user) {
              void usePlaylistStore.getState().syncFromCloud();
            }
          } else {
            // Preserve local persisted user if already signed in locally
            const current = get().user;
            set({
              authMode: "local",
              user: current?.mode === "local" ? current : null,
              initialized: true,
            });
          }
        } catch {
          set({ authMode: "local", initialized: true });
        }
      },

      register: async ({ username: rawUsername, displayName, password }) => {
        const username = normalizeUsername(rawUsername);
        const uErr = validateUsername(username);
        if (uErr) return { ok: false, error: uErr };
        const pErr = validatePassword(password);
        if (pErr) return { ok: false, error: pErr };

        const cleanDisplayName = (displayName || "").trim() || username;

        try {
          const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username,
              displayName: cleanDisplayName,
              password,
            }),
          });
          const data = (await res.json()) as {
            mode?: AuthMode;
            user?: AuthUser;
            allowLocalFallback?: boolean;
            error?: string;
          };

          if (!res.ok) {
            return {
              ok: false,
              error: data.error || "Không thể đăng ký tài khoản.",
            };
          }

          if (data.mode === "cloud" && data.user) {
            set({ authMode: "cloud", user: data.user });
            return { ok: true };
          }

          // Local Account Mode (no DATABASE_URL)
          const accounts = get().localAccounts;
          if (accounts.some((acc) => acc.username === username)) {
            return {
              ok: false,
              error: "Tên đăng nhập này đã tồn tại trên trình duyệt.",
            };
          }

          const passwordHash = await hashLocalPassword(username, password);
          const now = new Date().toISOString();
          const id = `local:${username}:${Date.now()}`;
          const newRecord: LocalAccountRecord = {
            id,
            username,
            displayName: cleanDisplayName,
            passwordHash,
            createdAt: now,
          };

          const authUser: AuthUser = {
            id,
            username,
            displayName: cleanDisplayName,
            mode: "local",
            createdAt: now,
          };

          set({
            authMode: "local",
            localAccounts: [...accounts, newRecord],
            user: authUser,
          });
          return { ok: true };
        } catch {
          return {
            ok: false,
            error: "Lỗi kết nối khi đăng ký tài khoản.",
          };
        }
      },

      login: async ({ username: rawUsername, password }) => {
        const username = normalizeUsername(rawUsername);
        const uErr = validateUsername(username);
        if (uErr) return { ok: false, error: uErr };
        const pErr = validatePassword(password);
        if (pErr) return { ok: false, error: pErr };

        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });
          const data = (await res.json()) as {
            mode?: AuthMode;
            user?: AuthUser;
            allowLocalFallback?: boolean;
            error?: string;
          };

          if (!res.ok) {
            return {
              ok: false,
              error: data.error || "Sai tên đăng nhập hoặc mật khẩu.",
            };
          }

          if (data.mode === "cloud" && data.user) {
            set({ authMode: "cloud", user: data.user });
            return { ok: true };
          }

          // Local Account Mode verification
          const record = get().localAccounts.find(
            (acc) => acc.username === username
          );
          if (!record) {
            return {
              ok: false,
              error: "Không tìm thấy tài khoản này trên trình duyệt.",
            };
          }

          const hash = await hashLocalPassword(username, password);
          if (hash !== record.passwordHash) {
            return { ok: false, error: "Sai tên đăng nhập hoặc mật khẩu." };
          }

          set({
            authMode: "local",
            user: {
              id: record.id,
              username: record.username,
              displayName: record.displayName,
              mode: "local",
              createdAt: record.createdAt,
            },
          });
          return { ok: true };
        } catch {
          return { ok: false, error: "Lỗi kết nối khi đăng nhập." };
        }
      },

      logout: async () => {
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } catch {}
        set({ user: null });
      },

      exportProfileJson: () => {
        const { user } = get();
        const player = usePlayerStore.getState();
        const settings = useSettingsStore.getState();
        const playlistStore = usePlaylistStore.getState();

        const backup: ProfileBackupJson = {
          version: 1,
          exportedAt: new Date().toISOString(),
          user,
          likedTracks: player.likedTracks,
          playlists: playlistStore.playlists,
          followedArtists: useArtistStore.getState().followedArtists,
          playerPrefs: {
            volume: player.volume,
            repeatMode: player.repeatMode,
            isShuffle: player.isShuffle,
          },
          apiKeys: {
            youtubeApiKey: settings.youtubeApiKey,
            spotifyClientId: settings.spotifyClientId,
            spotifyClientSecret: settings.spotifyClientSecret,
            soundcloudClientId: settings.soundcloudClientId,
          },
        };

        return JSON.stringify(backup, null, 2);
      },

      importProfileJson: (raw: string) => {
        try {
          const parsed = JSON.parse(raw) as Partial<ProfileBackupJson>;
          if (!parsed || parsed.version !== 1) {
            return {
              ok: false,
              error: "File JSON không đúng định dạng HnBeeMusic Profile (v1).",
            };
          }

          if (Array.isArray(parsed.likedTracks)) {
            usePlayerStore.setState({ likedTracks: parsed.likedTracks });
          }

          if (Array.isArray(parsed.playlists)) {
            usePlaylistStore.getState().setPlaylists(parsed.playlists);
          }

          if (Array.isArray(parsed.followedArtists)) {
            useArtistStore.getState().setFollowedArtists(parsed.followedArtists);
          }

          if (parsed.playerPrefs) {
            usePlayerStore.setState({
              volume:
                typeof parsed.playerPrefs.volume === "number"
                  ? parsed.playerPrefs.volume
                  : usePlayerStore.getState().volume,
              repeatMode:
                parsed.playerPrefs.repeatMode ??
                usePlayerStore.getState().repeatMode,
              isShuffle:
                typeof parsed.playerPrefs.isShuffle === "boolean"
                  ? parsed.playerPrefs.isShuffle
                  : usePlayerStore.getState().isShuffle,
            });
          }

          if (parsed.apiKeys) {
            useSettingsStore.getState().saveKeys({
              youtubeApiKey: parsed.apiKeys.youtubeApiKey || "",
              spotifyClientId: parsed.apiKeys.spotifyClientId || "",
              spotifyClientSecret: parsed.apiKeys.spotifyClientSecret || "",
              soundcloudClientId: parsed.apiKeys.soundcloudClientId || "",
            });
          }

          if (parsed.user && get().authMode === "local") {
            set({
              user: {
                ...parsed.user,
                mode: "local",
              },
            });
          }

          return { ok: true };
        } catch {
          return {
            ok: false,
            error: "Không thể đọc file JSON. Vui lòng kiểm tra lại file backup.",
          };
        }
      },
    }),
    {
      name: "hnbeemusic-local-auth",
      partialize: (state) => ({
        user: state.user?.mode === "local" ? state.user : null,
        localAccounts: state.localAccounts,
      }),
    }
  )
);
