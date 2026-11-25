import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export type OAuthProviderId = "google" | "facebook";

export const OAUTH_STATE_COOKIE = "hnbee_oauth_state";

export interface OAuthProviderMeta {
  id: OAuthProviderId;
  name: string;
  enabled: boolean;
  signinUrl: string;
  callbackUrl: string;
}

export interface OAuthProfile {
  provider: OAuthProviderId;
  providerId: string;
  email: string | null;
  displayName: string;
  username: string;
  avatarUrl: string | null;
}

/**
 * trustHost: true — resolves the exact public origin from x-forwarded-* headers
 * (Vercel / reverse proxies), falling back to request.nextUrl.origin or AUTH_URL.
 */
export function resolveTrustHostOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = request.headers.get("host")?.trim();
  if (host) {
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
    return `${isLocal ? "http" : "https"}://${host}`;
  }

  return (
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    request.nextUrl.origin
  ).replace(/\/+$/, "");
}

export function isProviderConfigured(provider: OAuthProviderId): boolean {
  if (provider === "google") {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() &&
        process.env.GOOGLE_CLIENT_SECRET?.trim()
    );
  }
  if (provider === "facebook") {
    return Boolean(
      process.env.FACEBOOK_CLIENT_ID?.trim() &&
        process.env.FACEBOOK_CLIENT_SECRET?.trim()
    );
  }
  return false;
}

export function getOAuthProvidersMeta(origin: string): Record<OAuthProviderId, OAuthProviderMeta> {
  return {
    google: {
      id: "google",
      name: "Google",
      enabled: isProviderConfigured("google"),
      signinUrl: `${origin}/api/auth/signin/google`,
      callbackUrl: `${origin}/api/auth/callback/google`,
    },
    facebook: {
      id: "facebook",
      name: "Facebook",
      enabled: isProviderConfigured("facebook"),
      signinUrl: `${origin}/api/auth/signin/facebook`,
      callbackUrl: `${origin}/api/auth/callback/facebook`,
    },
  };
}

function getStateSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.AUTH_JWT_SECRET ||
    "hnbeemusic-oauth-state-fallback"
  );
}

export function createSignedOAuthState(provider: OAuthProviderId): string {
  const nonce = randomBytes(16).toString("hex");
  const payload = `${provider}.${nonce}`;
  const sig = createHmac("sha256", getStateSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifySignedOAuthState(
  stateParam: string | null,
  cookieState: string | undefined,
  expectedProvider: OAuthProviderId
): boolean {
  if (!stateParam || !cookieState) return false;
  if (stateParam !== cookieState) return false;

  const parts = stateParam.split(".");
  if (parts.length !== 3) return false;
  const [provider, nonce, sig] = parts;
  if (provider !== expectedProvider || !nonce || !sig) return false;

  const expectedSig = createHmac("sha256", getStateSecret())
    .update(`${provider}.${nonce}`)
    .digest("hex");

  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expectedSig, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function buildOAuthAuthorizeUrl(
  provider: OAuthProviderId,
  origin: string,
  state: string
): string {
  const redirectUri = `${origin}/api/auth/callback/${provider}`;

  if (provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!.trim());
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
    url.searchParams.set("state", state);
    return url.toString();
  }

  const url = new URL("https://www.facebook.com/v20.0/dialog/oauth");
  url.searchParams.set("client_id", process.env.FACEBOOK_CLIENT_ID!.trim());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "public_profile,email");
  url.searchParams.set("state", state);
  return url.toString();
}

function buildSafeUsername(
  email: string | null,
  displayName: string,
  provider: OAuthProviderId,
  providerId: string
): string {
  const base = email
    ? email.split("@")[0]
    : displayName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/gi, "d");

  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 18);

  if (cleaned.length >= 3) return cleaned;
  return `${provider.slice(0, 2)}_${providerId.slice(-8).replace(/[^a-z0-9]/gi, "")}`;
}

export async function exchangeOAuthCodeForProfile(
  provider: OAuthProviderId,
  code: string,
  origin: string
): Promise<OAuthProfile> {
  const redirectUri = `${origin}/api/auth/callback/${provider}`;

  if (provider === "google") {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });

    if (!tokenRes.ok) {
      const txt = await tokenRes.text().catch(() => "");
      throw new Error(`Google token exchange failed (${tokenRes.status}): ${txt}`);
    }

    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      throw new Error("Google did not return access_token");
    }

    const profileRes = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
        cache: "no-store",
      }
    );

    if (!profileRes.ok) {
      throw new Error(`Google userinfo failed (${profileRes.status})`);
    }

    const info = (await profileRes.json()) as {
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
    };

    if (!info.sub) throw new Error("Google userinfo missing sub");

    const displayName = (info.name || info.email?.split("@")[0] || "Google User").trim();
    const highResAvatar = info.picture
      ? info.picture.replace(/=s\d+-c$/, "=s512-c")
      : null;

    return {
      provider: "google",
      providerId: info.sub,
      email: info.email || null,
      displayName,
      username: buildSafeUsername(info.email || null, displayName, "google", info.sub),
      avatarUrl: highResAvatar,
    };
  }

  // Facebook OAuth 2.0
  const tokenUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
  tokenUrl.searchParams.set("client_id", process.env.FACEBOOK_CLIENT_ID!.trim());
  tokenUrl.searchParams.set(
    "client_secret",
    process.env.FACEBOOK_CLIENT_SECRET!.trim()
  );
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);

  const tokenRes = await fetch(tokenUrl.toString(), { cache: "no-store" });
  if (!tokenRes.ok) {
    const txt = await tokenRes.text().catch(() => "");
    throw new Error(`Facebook token exchange failed (${tokenRes.status}): ${txt}`);
  }

  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new Error("Facebook did not return access_token");
  }

  const profileUrl = new URL("https://graph.facebook.com/v20.0/me");
  profileUrl.searchParams.set(
    "fields",
    "id,name,email,picture.width(512).height(512)"
  );
  profileUrl.searchParams.set("access_token", tokenJson.access_token);

  const profileRes = await fetch(profileUrl.toString(), { cache: "no-store" });
  if (!profileRes.ok) {
    throw new Error(`Facebook Graph profile failed (${profileRes.status})`);
  }

  const info = (await profileRes.json()) as {
    id?: string;
    name?: string;
    email?: string;
    picture?: { data?: { url?: string } };
  };

  if (!info.id) throw new Error("Facebook profile missing id");

  const displayName = (info.name || info.email?.split("@")[0] || "Facebook User").trim();

  return {
    provider: "facebook",
    providerId: info.id,
    email: info.email || null,
    displayName,
    username: buildSafeUsername(info.email || null, displayName, "facebook", info.id),
    avatarUrl: info.picture?.data?.url || null,
  };
}
