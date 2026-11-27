import { SignJWT, jwtVerify } from "jose";
import type { NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "hnbee_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  sub: string;
  username: string;
  displayName: string;
}

function getJwtSecret(): Uint8Array {
  const secret =
    process.env.AUTH_SECRET ||
    process.env.AUTH_JWT_SECRET ||
    process.env.DATABASE_URL ||
    "hnbeemusic-dev-fallback-secret-change-in-prod";
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  payload: SessionPayload
): Promise<string> {
  return new SignJWT({
    username: payload.username,
    displayName: payload.displayName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (
      !payload.sub ||
      typeof payload.username !== "string" ||
      payload.purpose === "desktop-handoff"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      username: payload.username,
      displayName:
        typeof payload.displayName === "string"
          ? payload.displayName
          : payload.username,
    };
  } catch {
    return null;
  }
}

/**
 * Short-lived (120s) signed token strictly scoped for Electron OS-browser -> hnbeemusic:// OAuth handoff.
 * Cannot be reused as a regular session cookie.
 */
export async function signDesktopHandoffToken(
  payload: SessionPayload
): Promise<string> {
  return new SignJWT({
    username: payload.username,
    displayName: payload.displayName,
    purpose: "desktop-handoff",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("120s")
    .sign(getJwtSecret());
}

export async function verifyDesktopHandoffToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (
      payload.purpose !== "desktop-handoff" ||
      !payload.sub ||
      typeof payload.username !== "string"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      username: payload.username,
      displayName:
        typeof payload.displayName === "string"
          ? payload.displayName
          : payload.username,
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
