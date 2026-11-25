import { NextRequest, NextResponse } from "next/server";
import {
  OAUTH_STATE_COOKIE,
  buildOAuthAuthorizeUrl,
  createSignedOAuthState,
  isProviderConfigured,
  resolveTrustHostOrigin,
  type OAuthProviderId,
} from "@/lib/auth/oauth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider: rawProvider } = await context.params;
  const provider = rawProvider.toLowerCase() as OAuthProviderId;

  if (provider !== "google" && provider !== "facebook") {
    return NextResponse.json(
      { error: "Provider không được hỗ trợ." },
      { status: 400 }
    );
  }

  const origin = resolveTrustHostOrigin(request);

  if (!isProviderConfigured(provider)) {
    return NextResponse.redirect(
      `${origin}/?oauth=error&reason=provider_not_configured&provider=${provider}`
    );
  }

  const state = createSignedOAuthState(provider);
  const authorizeUrl = buildOAuthAuthorizeUrl(provider, origin, state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  });

  return response;
}
