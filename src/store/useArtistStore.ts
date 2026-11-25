"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TrackSource } from "@/lib/audio/types";

export interface FollowedArtist {
  id: string;
  name: string;
  avatar: string;
  primarySource: TrackSource;
  followedAt: string;
}

interface ArtistStoreState {
  followedArtists: FollowedArtist[];
  toggleFollowArtist: (artist: Omit<FollowedArtist, "followedAt">) => void;
  isFollowing: (nameOrId: string) => boolean;
  setFollowedArtists: (artists: FollowedArtist[]) => void;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export const useArtistStore = create<ArtistStoreState>()(
  persist(
    (set, get) => ({
      followedArtists: [],

      toggleFollowArtist: (artist) => {
        const list = get().followedArtists;
        const exists = list.some(
          (a) => a.id === artist.id || norm(a.name) === norm(artist.name)
        );
        if (exists) {
          set({
            followedArtists: list.filter(
              (a) => a.id !== artist.id && norm(a.name) !== norm(artist.name)
            ),
          });
        } else {
          set({
            followedArtists: [
              { ...artist, followedAt: new Date().toISOString() },
              ...list,
            ],
          });
        }
      },

      isFollowing: (nameOrId) => {
        const target = norm(nameOrId);
        return get().followedArtists.some(
          (a) => norm(a.id) === target || norm(a.name) === target
        );
      },

      setFollowedArtists: (artists) => set({ followedArtists: artists }),
    }),
    {
      name: "hnbeemusic-followed-artists",
    }
  )
);
