import { NextRequest, NextResponse } from "next/server";
import {
  findUserById,
  hasDatabaseConfigured,
  toAuthUser,
} from "@/lib/auth/db";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/jwt";
import type { AuthMeResponse } from "@/lib/auth/types";

export async function GET(request: NextRequest) {
  if (!hasDatabaseConfigured()) {
    return NextResponse.json<AuthMeResponse>({
      mode: "local",
      user: null,
    });
  }

  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json<AuthMeResponse>({
        mode: "cloud",
        user: null,
      });
    }

    const payload = await verifySessionToken(token);
    if (!payload) {
      return NextResponse.json<AuthMeResponse>({
        mode: "cloud",
        user: null,
      });
    }

    const dbUser = await findUserById(payload.sub);
    return NextResponse.json<AuthMeResponse>({
      mode: "cloud",
      user: dbUser ? toAuthUser(dbUser) : null,
    });
  } catch (error) {
    console.error("[api/auth/me] error:", error);
    return NextResponse.json<AuthMeResponse>({
      mode: "cloud",
      user: null,
    });
  }
}
