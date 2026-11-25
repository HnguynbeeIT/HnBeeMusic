import { NextRequest, NextResponse } from "next/server";
import {
  getUserCloudSync,
  hasDatabaseConfigured,
  saveUserCloudSync,
} from "@/lib/auth/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/jwt";
import type { UserPlaylist } from "@/store/usePlaylistStore";

export async function GET(request: NextRequest) {
  if (!hasDatabaseConfigured()) {
    return NextResponse.json({ synced: false, playlists: [] });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ synced: false, playlists: [] });
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return NextResponse.json({ synced: false, playlists: [] });
  }

  try {
    const snapshot = await getUserCloudSync(payload.sub);
    return NextResponse.json({
      synced: true,
      playlists: snapshot?.playlists ?? [],
    });
  } catch (error) {
    console.error("[api/playlists] GET error:", error);
    return NextResponse.json({ synced: false, playlists: [] });
  }
}

export async function PUT(request: NextRequest) {
  if (!hasDatabaseConfigured()) {
    return NextResponse.json({ synced: false });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ synced: false });
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return NextResponse.json({ synced: false });
  }

  try {
    const body = (await request.json()) as { playlists?: UserPlaylist[] };
    const playlists = Array.isArray(body.playlists) ? body.playlists : [];
    const result = await saveUserCloudSync({
      userId: payload.sub,
      playlists,
    });
    return NextResponse.json({ synced: result.synced, syncedAt: result.syncedAt });
  } catch (error) {
    console.error("[api/playlists] PUT error:", error);
    return NextResponse.json({ synced: false }, { status: 500 });
  }
}
