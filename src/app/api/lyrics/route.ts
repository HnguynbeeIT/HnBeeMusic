import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchLyrics } from "@/lib/lyrics";
import { zingMp3Adapter } from "@/adapters";

export const maxDuration = 30;

const getCachedLyrics = unstable_cache(
  async (id: string, title: string, artist: string, duration: number) => {
    if (id.startsWith("zingmp3:")) {
      const zingId = id.slice("zingmp3:".length);
      const zingLyrics = await zingMp3Adapter.getLyrics(zingId);
      if (zingLyrics && (zingLyrics.lines.length > 0 || zingLyrics.plainText)) {
        return {
          synced: zingLyrics.lines.map((l) => ({
            time: l.timeMs / 1000,
            text: l.text,
          })),
          plain: zingLyrics.plainText ?? null,
          instrumental: false,
          source: "zingmp3",
        };
      }
    }
    return fetchLyrics({
      id: id || undefined,
      title,
      artist,
      duration: duration > 0 ? duration : undefined,
    });
  },
  ["hnbee-lrclib-lyrics-v2"],
  { revalidate: 86400 }
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") || "").trim();
  const artist = (searchParams.get("artist") || "").trim();
  const id = (searchParams.get("id") || "").trim();
  const duration = Number(searchParams.get("duration") || "0");

  if (!title) {
    return NextResponse.json(
      { error: "Thiếu tên bài hát (title)." },
      { status: 400 }
    );
  }

  try {
    const result = await getCachedLyrics(id, title, artist, duration);
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[api/lyrics] error:", error);
    return NextResponse.json({
      synced: [],
      plain: null,
      instrumental: false,
      source: "none",
    });
  }
}
