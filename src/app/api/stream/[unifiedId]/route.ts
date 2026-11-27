import type { NextRequest } from "next/server";
import { ensureAdaptersRegistered } from "@/adapters";
import {
  handleUnifiedStreamOptions,
  handleUnifiedStreamRequest,
} from "@/controllers/stream.controller";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ unifiedId: string }> }
) {
  ensureAdaptersRegistered();
  const { unifiedId } = await context.params;
  return handleUnifiedStreamRequest(request, unifiedId);
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ unifiedId: string }> }
) {
  ensureAdaptersRegistered();
  const { unifiedId } = await context.params;
  return handleUnifiedStreamRequest(request, unifiedId);
}

export function OPTIONS() {
  return handleUnifiedStreamOptions();
}
