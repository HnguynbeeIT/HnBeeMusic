import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  hasDatabaseConfigured,
  toAuthUser,
  upsertOAuthUser,
} from "@/lib/auth/db";
import {
  setSessionCookie,
  signDesktopHandoffToken,
  signSessionToken,
} from "@/lib/auth/jwt";
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
    const isDesktopFlow =
      request.cookies.get("hnbee_oauth_desktop")?.value === "1";

    if (isDesktopFlow) {
      const handoff = await signDesktopHandoffToken({
        sub: user.id,
        username: user.username,
        displayName: user.displayName,
      });
      const deepLink = `hnbeemusic://auth-callback?handoff=${encodeURIComponent(
        handoff
      )}&provider=${encodeURIComponent(provider)}`;
      const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Đăng nhập HnBee Music Desktop</title>
  <meta http-equiv="refresh" content="0;url=${deepLink}" />
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#09090b;color:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px;}
    .card{max-width:420px;border:1px solid rgba(255,255,255,.12);background:rgba(24,24,27,.85);border-radius:24px;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,.6);}
    a{display:inline-block;margin-top:18px;padding:12px 22px;border-radius:9999px;background:#34d399;color:#09090b;font-weight:700;text-decoration:none;font-size:14px;}
    p{color:#a1a1aa;font-size:13px;line-height:1.6;}
  </style>
</head>
<body>
  <div class="card">
    <h1 style="margin:0 0 8px;font-size:20px;">Đăng nhập thành công!</h1>
    <p>Đang tự động quay lại ứng dụng <strong>HnBee Music Desktop</strong>...</p>
    <a href="${deepLink}">Mở HnBee Music Desktop</a>
  </div>
  <script>window.location.href = ${JSON.stringify(deepLink)};</script>
</body>
</html>`;

      const desktopResp = new NextResponse(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
      desktopResp.cookies.set(OAUTH_STATE_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: origin.startsWith("https://"),
        path: "/",
        maxAge: 0,
      });
      desktopResp.cookies.set("hnbee_oauth_desktop", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: origin.startsWith("https://"),
        path: "/",
        maxAge: 0,
      });
      return desktopResp;
    }

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
