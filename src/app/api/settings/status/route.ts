import { NextResponse } from "next/server";

/**
 * Returns ONLY boolean flags indicating whether server-side API keys are active.
 * NEVER exposes actual key values.
 */
export async function GET() {
  const youtube = Boolean(process.env.YOUTUBE_API_KEY?.trim());
  const spotify = Boolean(
    process.env.SPOTIFY_CLIENT_ID?.trim() &&
      process.env.SPOTIFY_CLIENT_SECRET?.trim()
  );
  const soundcloud = Boolean(process.env.SOUNDCLOUD_CLIENT_ID?.trim());

  return NextResponse.json(
    {
      serverKeyActive: youtube || spotify,
      youtube,
      spotify,
      soundcloud,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
