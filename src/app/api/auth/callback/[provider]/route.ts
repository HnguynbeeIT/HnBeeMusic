import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  hasDatabaseConfigured,
  toAuthUser,
  upsertOAuthUser,
} from "@/lib/auth/db";
import { setSessionCookie, signSessionToken } from "@/lib/auth/jwt";
import {
  OAUTH_STATE_COOKIE,
  exchangeOAuthCodeForProfile,
  isProviderConfigured,
  resolveTrustHostOrigin,
  verifySignedOAuthState,
  type OAuthProviderId,
} from "@/lib/auth/oauth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider: rawProvider } = await context.params;
  const provider = rawProvider.toLowerCase() as OAuthProviderId;
  const origin = resolveTrustHostOrigin(request);

  if (provider !== "google" && provider !== "facebook") {
    return NextResponse.redirect(`${origin}/?oauth=error&reason=invalid_provider`);
  }

  const { searchParams } = new URL(request.url);
  const errorParam = searchParams.get("error");
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");

  if (errorParam || !code) {
    return NextResponse.redirect(
      `${origin}/?oauth=error&reason=${encodeURIComponent(
        errorParam || "missing_code"
      )}&provider=${provider}`
    );
  }

  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!verifySignedOAuthState(stateParam, cookieState, provider)) {
    return NextResponse.redirect(
      `${origin}/?oauth=error&reason=invalid_state&provider=${provider}`
    );
  }

  if (!isProviderConfigured(provider) || !hasDatabaseConfigured()) {
    return NextResponse.redirect(
      `${origin}/?oauth=error&reason=server_not_configured&provider=${provider}`
    );
  }

  try {
    const profile = await exchangeOAuthCodeForProfile(provider, code, origin);

    const dbUser = await upsertOAuthUser({
      id: randomUUID(),
      provider: profile.provider,
      providerId: profile.providerId,
      email: profile.email,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    });

    const user = toAuthUser(dbUser);
    const token = await signSessionToken({
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
    });

    const response = NextResponse.redirect(
      `${origin}/?oauth=success&provider=${provider}`
    );
    setSessionCookie(response, token);
    // Clear one-time CSRF state cookie
    response.cookies.set(OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error(`[api/auth/callback/${provider}] error:`, error);
    return NextResponse.redirect(
      `${origin}/?oauth=error&reason=callback_failed&provider=${provider}`
    );
  }
}
