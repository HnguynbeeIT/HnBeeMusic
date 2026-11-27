import { NextRequest, NextResponse } from "next/server";
import {
  setSessionCookie,
  signSessionToken,
  verifyDesktopHandoffToken,
} from "@/lib/auth/jwt";
import { resolveTrustHostOrigin } from "@/lib/auth/oauth";

/**
 * Completes the secure OS-browser -> hnbeemusic://auth-callback OAuth handoff
 * inside the Electron Desktop app by exchanging a short-lived signed handoff token
 * for an HttpOnly session cookie.
 */
export async function GET(request: NextRequest) {
  const origin = resolveTrustHostOrigin(request);
  const { searchParams } = new URL(request.url);
  const handoff = searchParams.get("handoff");
  const provider = searchParams.get("provider") || "google";

  if (!handoff) {
    return NextResponse.redirect(
      `${origin}/?oauth=error&reason=missing_handoff&provider=${encodeURIComponent(
        provider
      )}`
    );
  }

  const payload = await verifyDesktopHandoffToken(handoff);
  if (!payload) {
    return NextResponse.redirect(
      `${origin}/?oauth=error&reason=invalid_handoff&provider=${encodeURIComponent(
        provider
      )}`
    );
  }

  const sessionToken = await signSessionToken(payload);
  const response = NextResponse.redirect(
    `${origin}/?oauth=success&provider=${encodeURIComponent(provider)}`
  );
  setSessionCookie(response, sessionToken);
  return response;
}
