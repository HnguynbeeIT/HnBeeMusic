import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { resolveSoundCloudStream } from "@/lib/adapters/soundcloud";

export const maxDuration = 30;

const getCachedSoundCloudStream = unstable_cache(
  async (url: string) => {
    const resolved = await resolveSoundCloudStream(url);
    return {
      ...resolved,
      widgetEmbedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(
        url
      )}&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false`,
    };
  },
  ["hnbee-soundcloud-stream-v2"],
  { revalidate: 900 }
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = (searchParams.get("url") || "").trim();

  if (!url || !/soundcloud\.com/i.test(url)) {
    return NextResponse.json(
      { error: "Thiếu hoặc sai định dạng URL SoundCloud." },
      { status: 400 }
    );
  }

  const scClientIdHeader =
    request.headers.get("x-soundcloud-client-id")?.trim() || undefined;

  try {
    const data = scClientIdHeader
      ? {
          ...(await resolveSoundCloudStream(url, scClientIdHeader)),
          widgetEmbedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(
            url
          )}&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&visual=false`,
        }
      : await getCachedSoundCloudStream(url);

    if (!data.track && !data.streamUrl) {
      return NextResponse.json(
        { error: "Không tìm thấy track SoundCloud." },
        { status: 404 }
      );
    }
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": scClientIdHeader
          ? "private, no-store"
          : "public, s-maxage=600, stale-while-revalidate=900",
      },
    });
  } catch (error) {
    console.error("[api/stream/soundcloud] error:", error);
    return NextResponse.json(
      { error: "Lỗi máy chủ khi xử lý SoundCloud stream." },
      { status: 500 }
    );
  }
}
