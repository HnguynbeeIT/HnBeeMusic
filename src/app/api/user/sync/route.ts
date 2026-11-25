import { NextRequest, NextResponse } from "next/server";
import {
  getUserCloudSync,
  hasDatabaseConfigured,
  saveUserCloudSync,
} from "@/lib/auth/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/jwt";
import type { UnifiedTrack } from "@/lib/audio/types";
import type { UserPlaylist } from "@/store/usePlaylistStore";
import type { FollowedArtist } from "@/store/useArtistStore";

function mergePlaylists(
  serverList: UserPlaylist[],
  localList: UserPlaylist[]
): UserPlaylist[] {
  const byId = new Map<string, UserPlaylist>();
  for (const pl of serverList) {
    byId.set(pl.id, pl);
  }
  for (const localPl of localList) {
    const existing = byId.get(localPl.id);
    if (!existing) {
      byId.set(localPl.id, localPl);
    } else {
      // Merge tracks without duplicates while preserving order
      const seen = new Set(existing.tracks.map((t) => t.id));
      const mergedTracks = [
        ...existing.tracks,
        ...localPl.tracks.filter((t) => !seen.has(t.id)),
      ];
      byId.set(localPl.id, {
        ...existing,
        tracks: mergedTracks,
        updatedAt:
          new Date(localPl.updatedAt).getTime() >
          new Date(existing.updatedAt).getTime()
            ? localPl.updatedAt
            : existing.updatedAt,
      });
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

function mergeTracks(
  serverList: UnifiedTrack[],
  localList: UnifiedTrack[]
): UnifiedTrack[] {
  const seen = new Set<string>();
  const merged: UnifiedTrack[] = [];
  for (const t of [...serverList, ...localList]) {
    if (!t?.id || seen.has(t.id)) continue;
    seen.add(t.id);
    merged.push(t);
  }
  return merged;
}

function mergeArtists(
  serverList: FollowedArtist[],
  localList: FollowedArtist[]
): FollowedArtist[] {
  const seen = new Set<string>();
  const merged: FollowedArtist[] = [];
  for (const a of [...serverList, ...localList]) {
    const key = (a?.name || a?.id || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(a);
  }
  return merged;
}

export async function GET(request: NextRequest) {
  if (!hasDatabaseConfigured()) {
    return NextResponse.json(
      { synced: false, error: "Cloud DB chưa được cấu hình." },
      { status: 503 }
    );
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { synced: false, error: "Chưa đăng nhập." },
      { status: 401 }
    );
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return NextResponse.json(
      { synced: false, error: "Phiên đăng nhập không hợp lệ." },
      { status: 401 }
    );
  }

  try {
    const snapshot = await getUserCloudSync(payload.sub);
    if (!snapshot) {
      return NextResponse.json(
        { synced: false, error: "Không tìm thấy hồ sơ người dùng." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      synced: true,
      ...snapshot,
    });
  } catch (error) {
    console.error("[api/user/sync] GET error:", error);
    return NextResponse.json(
      { synced: false, error: "Lỗi máy chủ khi tải dữ liệu đồng bộ." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!hasDatabaseConfigured()) {
    return NextResponse.json(
      { synced: false, error: "Cloud DB chưa được cấu hình." },
      { status: 503 }
    );
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { synced: false, error: "Chưa đăng nhập." },
      { status: 401 }
    );
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return NextResponse.json(
      { synced: false, error: "Phiên đăng nhập không hợp lệ." },
      { status: 401 }
    );
  }

  try {
    const body = (await request.json()) as {
      region?: string;
      displayName?: string;
      playlists?: UserPlaylist[];
      likedTracks?: UnifiedTrack[];
      followedArtists?: FollowedArtist[];
      merge?: boolean;
    };

    let playlists = Array.isArray(body.playlists) ? body.playlists : undefined;
    let likedTracks = Array.isArray(body.likedTracks)
      ? body.likedTracks
      : undefined;
    let followedArtists = Array.isArray(body.followedArtists)
      ? body.followedArtists
      : undefined;
    let region = body.region;

    // Auto-Migration Merge Mode: combine local browser data with existing server data safely
    if (body.merge) {
      const existing = await getUserCloudSync(payload.sub);
      if (existing) {
        playlists = mergePlaylists(existing.playlists, playlists || []);
        likedTracks = mergeTracks(existing.likedTracks, likedTracks || []);
        followedArtists = mergeArtists(
          existing.followedArtists,
          followedArtists || []
        );
        region = region || existing.profile.region || "VN";
      }
    }

    const result = await saveUserCloudSync({
      userId: payload.sub,
      region,
      displayName: body.displayName,
      playlists,
      likedTracks,
      followedArtists,
    });

    return NextResponse.json({
      synced: result.synced,
      syncedAt: result.syncedAt,
      ...(body.merge
        ? {
            playlists: playlists ?? [],
            likedTracks: likedTracks ?? [],
            followedArtists: followedArtists ?? [],
            region: region || "VN",
          }
        : {}),
    });
  } catch (error) {
    console.error("[api/user/sync] POST error:", error);
    return NextResponse.json(
      { synced: false, error: "Lỗi máy chủ khi lưu dữ liệu đồng bộ." },
      { status: 500 }
    );
  }
}
