import { createHash, createHmac, randomBytes } from "crypto";
import type { SyncedLyricLine } from "@/types/audio";

/**
 * Cryptographic & signing helpers dedicated to Vietnamese music platforms
 * (Zing MP3 HMAC-SHA512 request signatures and NhacCuaTui MD5 session tokens).
 */

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hmacSha512Hex(message: string, secret: string): string {
  return createHmac("sha512", secret).update(message, "utf8").digest("hex");
}

export function md5Hex(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

/**
 * Generates Zing MP3 API v2 `sig` signature:
 *   hash256 = SHA256(sorted key=value pairs of allowed signature params)
 *   sig     = HMAC-SHA512(apiPath + hash256, secretKey)
 */
export function buildZingSignature(
  apiPath: string,
  params: Record<string, string>,
  secretKey: string
): string {
  const sortedKeys = Object.keys(params).sort();
  const payload = sortedKeys.map((key) => `${key}=${params[key]}`).join("");
  const hashedParams = sha256Hex(payload);
  return hmacSha512Hex(`${apiPath}${hashedParams}`, secretKey);
}

/**
 * Generates a deterministic-format device ID and MD5 token signature for NhacCuaTui v1 token exchange.
 */
export function createNctDeviceInfo(): string {
  const deviceId = randomBytes(16).toString("hex");
  return JSON.stringify({
    DeviceID: deviceId,
    OsName: "WEB",
    OsVersion: "10",
    AppName: "NhacCuaTui",
    AppVersion: "1.0.0",
    UserInfo: "",
    LocationInfo: "",
  });
}

export function buildNctTokenSignature(
  timestampSeconds: string,
  secretSalt: string
): string {
  return md5Hex(`${secretSalt}${timestampSeconds}`);
}

const LRC_TIME_REGEX = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

/**
 * Parses standard LRC synced lyrics (`[mm:ss.xx] Line text`) into sorted SyncedLyricLine[].
 */
export function parseLrcContent(rawLrc: string): SyncedLyricLine[] {
  const lines: SyncedLyricLine[] = [];
  const rawRows = rawLrc.split(/\r?\n/);

  for (const row of rawRows) {
    const timestamps: number[] = [];
    let match: RegExpExecArray | null = null;
    LRC_TIME_REGEX.lastIndex = 0;

    while ((match = LRC_TIME_REGEX.exec(row)) !== null) {
      const minutes = Number.parseInt(match[1] ?? "0", 10);
      const seconds = Number.parseInt(match[2] ?? "0", 10);
      const fracRaw = match[3] ?? "0";
      const millis = Number.parseInt(fracRaw.padEnd(3, "0").slice(0, 3), 10);
      timestamps.push(minutes * 60_000 + seconds * 1000 + millis);
    }

    if (timestamps.length === 0) continue;
    const text = row.replace(LRC_TIME_REGEX, "").trim();
    if (!text) continue;

    for (const timeMs of timestamps) {
      lines.push({ timeMs, text });
    }
  }

  return lines.sort((a, b) => a.timeMs - b.timeMs);
}
