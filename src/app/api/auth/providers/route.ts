import { NextRequest, NextResponse } from "next/server";
import {
  getOAuthProvidersMeta,
  resolveTrustHostOrigin,
} from "@/lib/auth/oauth";

export async function GET(request: NextRequest) {
  const origin = resolveTrustHostOrigin(request);
  const providers = getOAuthProvidersMeta(origin);

  return NextResponse.json(providers, {
    headers: { "Cache-Control": "no-store" },
  });
}
