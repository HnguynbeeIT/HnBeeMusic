"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { usePlaylistStore } from "@/store/usePlaylistStore";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useArtistStore } from "@/store/useArtistStore";
import { useRegion } from "@/context/RegionContext";

const AUTO_SYNC_DEBOUNCE_MS = 500;

/**
 * Mounted ONCE in RootLayout.
 * Watches Playlists, Liked Songs, Followed Artists, and Region changes and
 * automatically pushes them to /api/user/sync (500ms debounced) when signed into Cloud Sync.
 */
export function CloudSyncManager() {
  const user = useAuthStore((s) => s.user);
  const authMode = useAuthStore((s) => s.authMode);
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const syncNow = useAuthStore((s) => s.syncNow);

  const playlists = usePlaylistStore((s) => s.playlists);
  const likedTracks = usePlayerStore((s) => s.likedTracks);
  const followedArtists = useArtistStore((s) => s.followedArtists);
  const { region } = useRegion();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyForUserRef = useRef<string | null>(null);
  const lastDigestRef = useRef<string>("");

  const isCloudSignedIn = Boolean(user && authMode === "cloud");

  useEffect(() => {
    if (!isCloudSignedIn || !user) {
      readyForUserRef.current = null;
      lastDigestRef.current = "";
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    if (isHydrating) return;

    const digest = JSON.stringify({
      r: region,
      p: playlists.map((pl) => `${pl.id}:${pl.name}:${pl.updatedAt}:${pl.tracks.length}`),
      l: likedTracks.map((t) => t.id),
      a: followedArtists.map((a) => a.id),
    });

    // Skip the very first snapshot right after hydration/login to avoid redundant POST
    if (readyForUserRef.current !== user.id) {
      readyForUserRef.current = user.id;
      lastDigestRef.current = digest;
      return;
    }

    if (digest === lastDigestRef.current) return;
    lastDigestRef.current = digest;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void syncNow(region);
    }, AUTO_SYNC_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    isCloudSignedIn,
    user,
    isHydrating,
    playlists,
    likedTracks,
    followedArtists,
    region,
    syncNow,
  ]);

  return null;
}
