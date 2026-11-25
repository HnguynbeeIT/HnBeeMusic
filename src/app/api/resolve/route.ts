import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { parseMusicUrl } from "@/lib/audio/url-parser";
import type { ResolveResponse, UnifiedTrack } from "@/lib/audio/types";
import {
  resolveYouTubePlaylist,
  resolveYouTubeTrack,
} from "@/lib/adapters/youtube";
import { resolveSoundCloudTrack } from "@/lib/adapters/soundcloud";
import {
  matchSpotifyTrackToAudio,
  resolveSpotifyResource,
} from "@/lib/adapters/spotify";
import { fetchUnifiedArtist } from "@/lib/adapters/artist";

export const maxDuration = 30;

const cachedLazyMatch = unstable_cache(
  async (
    id: string,
    title: string,
    artist: string,
    thumbnail: string,
    duration: number,
    sourceUrl: string
  ): Promise<UnifiedTrack> => {
    return matchSpotifyTrackToAudio({
      id,
      title,
      artist,
      thumbnail,
      duration,
      source: "spotify",
      sourceUrl,
    });
  },
  ["hnbee-spotify-lazy-match"],
  { revalidate: 3600 }
);

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      url?: string;
      matchTrack?: UnifiedTrack;
    };

    const ytHeader =
      request.headers.get("x-youtube-key")?.trim() ||
      request.headers.get("x-youtube-api-key")?.trim() ||
      undefined;
    const spIdHeader =
      request.headers.get("x-spotify-id")?.trim() ||
      request.headers.get("x-spotify-client-id")?.trim() ||
      undefined;
    const spSecretHeader =
      request.headers.get("x-spotify-secret")?.trim() ||
      request.headers.get("x-spotify-client-secret")?.trim() ||
      undefined;
    const byokCredentials = {
      youtubeApiKey: ytHeader,
      clientId: spIdHeader,
      clientSecret: spSecretHeader,
    };

    // Mode 1: Lazy Stream Matching for Spotify tracks OR SoundCloud 30s Go+ SNIPPET tracks
    if (body.matchTrack) {
      const t = body.matchTrack;
      if (t.source !== "spotify" && !t.isSnippet) {
        return NextResponse.json({ track: t });
      }
      if (t.source === "soundcloud" && t.isSnippet) {
        const matched = await matchSpotifyTrackToAudio(
          { ...t, streamUrl: undefined, resolvedSource: undefined },
          byokCredentials
        );
        return NextResponse.json({ track: matched });
      }
      const matched = ytHeader
        ? await matchSpotifyTrackToAudio(t, byokCredentials)
        : await cachedLazyMatch(
            t.id,
            t.title,
            t.artist,
            t.thumbnail,
            t.duration,
            t.sourceUrl
          );
      return NextResponse.json({ track: matched });
    }

    // Mode 2: Parse & Resolve pasted URL (YouTube Video/Playlist, SoundCloud, Spotify)
    const rawUrl = (body.url || "").trim();
    const parsed = parseMusicUrl(rawUrl);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "URL không hợp lệ. Hỗ trợ link YouTube (Video/Playlist), SoundCloud hoặc Spotify (Track/Playlist/Album).",
        },
        { status: 400 }
      );
    }

    if (parsed.source === "youtube" && parsed.resourceType === "playlist") {
      const playlist = await resolveYouTubePlaylist(parsed.id, ytHeader);
      if (!playlist || playlist.tracks.length === 0) {
        return NextResponse.json(
          {
            error:
              "Không thể tải YouTube Playlist. Hãy nhập YouTube Data API v3 Key trong API Settings (BYOK) hoặc .env.local.",
          },
          { status: 404 }
        );
      }
      return NextResponse.json<ResolveResponse>({
        type: "playlist",
        title: playlist.title,
        tracks: playlist.tracks,
      });
    }

    if (parsed.source === "youtube") {
      const track = await resolveYouTubeTrack(parsed.id, ytHeader);
      if (!track) {
        return NextResponse.json(
          { error: "Không thể lấy thông tin từ link YouTube này." },
          { status: 404 }
        );
      }
      return NextResponse.json<ResolveResponse>({
        type: "track",
        title: track.title,
        tracks: [track],
      });
    }

    if (parsed.source === "soundcloud") {
      const track = await resolveSoundCloudTrack(parsed.url);
      if (!track) {
        return NextResponse.json(
          { error: "Không thể lấy thông tin từ link SoundCloud này." },
          { status: 404 }
        );
      }
      return NextResponse.json<ResolveResponse>({
        type: "track",
        title: track.title,
        tracks: [track],
      });
    }

    // Spotify Artist URL -> return artist metadata so UI navigates directly to /artist/[slug]
    if (parsed.source === "spotify" && parsed.resourceType === "artist") {
      const artistData = await fetchUnifiedArtist({
        name: "",
        id: parsed.id,
        source: "spotify",
        preferredSource: "spotify",
        credentials: {
          youtubeApiKey: ytHeader,
          spotifyClientId: spIdHeader,
          spotifyClientSecret: spSecretHeader,
        },
      });
      return NextResponse.json({
        type: "artist",
        artistId: parsed.id,
        artistName: artistData.profile.name,
        title: artistData.profile.name,
        tracks: artistData.tracks,
      });
    }

    // Spotify: Metadata extraction ONLY (lazy matching runs when user plays a track)
    const resolved = await resolveSpotifyResource(
      parsed.resourceType as "track" | "playlist" | "album",
      parsed.id,
      byokCredentials
    );
    if (!resolved || resolved.tracks.length === 0) {
      return NextResponse.json(
        {
          error:
            "Không thể lấy metadata từ Spotify. Hãy nhập Spotify Client ID & Secret trong API Settings hoặc .env.local.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json<ResolveResponse>(resolved);
  } catch (error) {
    console.error("[api/resolve] error:", error);
    return NextResponse.json(
      { error: "Đã xảy ra lỗi khi xử lý liên kết." },
      { status: 500 }
    );
  }
}
