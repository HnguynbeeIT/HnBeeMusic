import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  findUserByUsername,
  hasDatabaseConfigured,
  toAuthUser,
} from "@/lib/auth/db";
import { setSessionCookie, signSessionToken } from "@/lib/auth/jwt";
import {
  normalizeUsername,
  validatePassword,
  validateUsername,
} from "@/lib/auth/validation";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };

    const username = normalizeUsername(body.username || "");
    const password = body.password || "";

    const usernameErr = validateUsername(username);
    if (usernameErr) {
      return NextResponse.json({ error: usernameErr }, { status: 400 });
    }

    const passwordErr = validatePassword(password);
    if (passwordErr) {
      return NextResponse.json({ error: passwordErr }, { status: 400 });
    }

    if (!hasDatabaseConfigured()) {
      return NextResponse.json({
        mode: "local",
        allowLocalFallback: true,
      });
    }

    const dbUser = await findUserByUsername(username);
    if (!dbUser) {
      return NextResponse.json(
        { error: "Sai tên đăng nhập hoặc mật khẩu." },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, dbUser.password_hash);
    if (!valid) {
      return NextResponse.json(
        { error: "Sai tên đăng nhập hoặc mật khẩu." },
        { status: 401 }
      );
    }

    const user = toAuthUser(dbUser);
    const token = await signSessionToken({
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
    });

    const response = NextResponse.json({ mode: "cloud", user });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("[api/auth/login] error:", error);
    return NextResponse.json(
      { error: "Lỗi máy chủ khi đăng nhập." },
      { status: 500 }
    );
  }
}
