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
import {
  findExtendedAdapterForUrl,
  zingMp3ProviderAdapter,
} from "@/lib/adapters/extended-providers";

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
    const matched = await matchSpotifyTrackToAudio({
      id,
      title,
      artist,
      thumbnail,
      duration,
      source: "spotify",
      sourceUrl,
    });
    // Throw on miss so Next.js unstable_cache NEVER caches a failed match for 1 hour!
    if (!matched.streamUrl || !matched.resolvedSource) {
      throw new Error("SPOTIFY_MATCH_MISS");
    }
    return matched;
  },
  ["hnbee-spotify-lazy-match-v3"],
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

    // Mode 1: Lazy Stream Matching / Fallback Bridge for Spotify, Apple Music, Zing MP3, NhacCuaTui, Audius & SoundCloud snippets
    if (body.matchTrack) {
      const t = body.matchTrack;
      const supportsBridge =
        t.source === "spotify" ||
        t.source === "apple_music" ||
        t.source === "zingmp3" ||
        t.source === "nhaccuatui" ||
        t.source === "audius" ||
        Boolean(t.isSnippet);

      if (!supportsBridge) {
        return NextResponse.json({ track: t });
      }
      if (t.source === "soundcloud" && t.isSnippet) {
        const matched = await matchSpotifyTrackToAudio(
          { ...t, streamUrl: undefined, resolvedSource: undefined },
          byokCredentials
        );
        return NextResponse.json({ track: matched });
      }
      let matched: UnifiedTrack = t;
      if (ytHeader || t.source !== "spotify") {
        matched = await matchSpotifyTrackToAudio(
          { ...t, streamUrl: undefined, resolvedSource: undefined },
          byokCredentials
        );
      } else {
        try {
          matched = await cachedLazyMatch(
            t.id,
            t.title,
            t.artist,
            t.thumbnail,
            t.duration,
            t.sourceUrl
          );
        } catch {
          matched = t;
        }
      }

      if (!matched.streamUrl && t.source === "apple_music") {
        const zingCandidates = await zingMp3ProviderAdapter.search(
          `${t.title} ${t.artist}`,
          3
        );
        const zingHit = zingCandidates[0];
        if (zingHit?.streamUrl) {
          matched = {
            ...t,
            streamUrl: zingHit.streamUrl,
            resolvedSource: "zingmp3",
            matchedTitle: zingHit.title,
          };
        }
      }

      return NextResponse.json({ track: matched });
    }

    // Mode 2: Parse & Resolve pasted URL (Spotify, YouTube, SoundCloud, Zing MP3, NhacCuaTui, Apple Music, Audius)
    const rawUrl = (body.url || "").trim();
    const parsed = parseMusicUrl(rawUrl);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "URL không hợp lệ. Hỗ trợ Spotify, YouTube, SoundCloud, Zing MP3, NhacCuaTui, Apple Music và Audius.",
        },
        { status: 400 }
      );
    }

    // Extended platforms (Zing MP3, NhacCuaTui, Apple Music, Audius)
    const extendedAdapter = findExtendedAdapterForUrl(rawUrl);
    if (extendedAdapter) {
      const resolvedExtended = await extendedAdapter.resolveUrl(rawUrl);
      if (!resolvedExtended || resolvedExtended.tracks.length === 0) {
        return NextResponse.json(
          { error: `Không thể tải nội dung từ liên kết ${parsed.source} này.` },
          { status: 404 }
        );
      }
      return NextResponse.json<ResolveResponse>(resolvedExtended, {
        headers: {
          "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
        },
      });
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

    if (parsed.source !== "spotify") {
      return NextResponse.json(
        { error: "Không hỗ trợ định dạng liên kết này." },
        { status: 400 }
      );
    }

    // Spotify: Metadata extraction ONLY (lazy matching runs when user plays a track)
    const resolved = await resolveSpotifyResource(
      parsed.resourceType as "track" | "playlist" | "album",
      parsed.id,
      byokCredentials
    );
    if (!resolved || resolved.tracks.length === 0) {
      const hasSpotifyKey = Boolean(
        (spIdHeader && spSecretHeader) ||
          (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
      );
      return NextResponse.json(
        {
          error: hasSpotifyKey
            ? "Không thể tải danh sách từ link Spotify này. Link có thể không tồn tại hoặc Playlist đang ở chế độ Riêng tư (Private)."
            : "Không thể tải nội dung từ link Spotify này (Playlist có thể đang ở chế độ Riêng tư hoặc chưa cấu hình Spotify API Key trong Settings).",
        },
        { status: 404 }
      );
    }

    return NextResponse.json<ResolveResponse>(resolved, {
      headers: {
        "Cache-Control":
          spIdHeader || ytHeader
            ? "private, no-store"
            : "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[api/resolve] error:", error);
    return NextResponse.json(
      { error: "Đã xảy ra lỗi khi xử lý liên kết." },
      { status: 500 }
    );
  }
}
