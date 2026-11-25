import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  createDbUser,
  findUserByUsername,
  hasDatabaseConfigured,
  toAuthUser,
} from "@/lib/auth/db";
import { setSessionCookie, signSessionToken } from "@/lib/auth/jwt";
import { checkRegisterRateLimit, getClientIp } from "@/lib/auth/rate-limit";
import {
  normalizeUsername,
  validatePassword,
  validateUsername,
} from "@/lib/auth/validation";

export async function POST(request: NextRequest) {
  try {
    // Basic anti-spam IP rate limit: max 5 accounts/hour/IP
    const ip = getClientIp(request.headers);
    const rateLimit = checkRegisterRateLimit(ip);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Bạn đã tạo quá nhiều tài khoản từ IP này. Vui lòng thử lại sau ${Math.ceil(
            rateLimit.retryAfterSeconds / 60
          )} phút.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    const body = (await request.json()) as {
      username?: string;
      displayName?: string;
      password?: string;
    };

    const username = normalizeUsername(body.username || "");
    const displayName = (body.displayName || "").trim() || username;
    const password = body.password || "";

    const usernameErr = validateUsername(username);
    if (usernameErr) {
      return NextResponse.json({ error: usernameErr }, { status: 400 });
    }

    const passwordErr = validatePassword(password);
    if (passwordErr) {
      return NextResponse.json({ error: passwordErr }, { status: 400 });
    }

    // Dual-Mode Auth: fall back cleanly to Local Account Mode when no DATABASE_URL
    if (!hasDatabaseConfigured()) {
      return NextResponse.json({
        mode: "local",
        allowLocalFallback: true,
      });
    }

    const existing = await findUserByUsername(username);
    if (existing) {
      return NextResponse.json(
        { error: "Tên đăng nhập này đã tồn tại. Hãy chọn tên khác." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await createDbUser({
      id: randomUUID(),
      username,
      displayName,
      passwordHash,
    });

    const user = toAuthUser(created);
    const token = await signSessionToken({
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
    });

    const response = NextResponse.json(
      { mode: "cloud", user },
      { status: 201 }
    );
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("[api/auth/register] error:", error);
    return NextResponse.json(
      { error: "Không thể tạo tài khoản lúc này. Vui lòng thử lại." },
      { status: 500 }
    );
  }
}
