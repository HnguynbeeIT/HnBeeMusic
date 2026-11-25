import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import type { TrackSource } from "@/lib/audio/types";
import { fetchUnifiedArtist } from "@/lib/adapters/artist";

export const maxDuration = 30;

const getCachedArtist = unstable_cache(
  async (
    name: string,
    id: string,
    source: "all" | TrackSource,
    preferredSource: TrackSource | "",
    _envSig: string
  ) => {
    return fetchUnifiedArtist({
      name,
      id: id || undefined,
      source,
      preferredSource: preferredSource || undefined,
    });
  },
  ["hnbee-unified-artist-v7"],
  { revalidate: 1800 }
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = (searchParams.get("name") || "").trim();
  const id = (searchParams.get("id") || "").trim();
  const rawSource = (searchParams.get("source") || "all").toLowerCase();
  const source: "all" | TrackSource =
    rawSource === "spotify" ||
    rawSource === "youtube" ||
    rawSource === "soundcloud"
      ? rawSource
      : "all";
  const rawPreferred = (searchParams.get("preferredSource") || "").toLowerCase();
  const preferredSource: TrackSource | "" =
    rawPreferred === "spotify" ||
    rawPreferred === "youtube" ||
    rawPreferred === "soundcloud"
      ? rawPreferred
      : "";

  if (!name && !id) {
    return NextResponse.json(
      { error: "Thiếu tên nghệ sĩ (name) hoặc ID." },
      { status: 400 }
    );
  }

  const ytHeader =
    request.headers.get("x-youtube-key")?.trim() ||
    request.headers.get("x-youtube-api-key")?.trim() ||
    "";
  const spIdHeader =
    request.headers.get("x-spotify-id")?.trim() ||
    request.headers.get("x-spotify-client-id")?.trim() ||
    "";
  const spSecretHeader =
    request.headers.get("x-spotify-secret")?.trim() ||
    request.headers.get("x-spotify-client-secret")?.trim() ||
    "";
  const scClientIdHeader =
    request.headers.get("x-soundcloud-client-id")?.trim() || "";

  const hasByok = Boolean(
    ytHeader || (spIdHeader && spSecretHeader) || scClientIdHeader
  );

  try {
    const envSig = `${Boolean(process.env.YOUTUBE_API_KEY)}:${Boolean(
      process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET
    )}`;

    const data = hasByok
      ? await fetchUnifiedArtist({
          name,
          id: id || undefined,
          source,
          preferredSource: preferredSource || undefined,
          credentials: {
            youtubeApiKey: ytHeader || undefined,
            spotifyClientId: spIdHeader || undefined,
            spotifyClientSecret: spSecretHeader || undefined,
            soundcloudClientId: scClientIdHeader || undefined,
          },
        })
      : await getCachedArtist(name, id, source, preferredSource, envSig);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": hasByok
          ? "private, no-store"
          : "public, s-maxage=900, stale-while-revalidate=1800",
      },
    });
  } catch (error) {
    console.error("[api/artist] error:", error);
    return NextResponse.json(
      { error: "Không thể tải thông tin nghệ sĩ lúc này." },
      { status: 500 }
    );
  }
}
