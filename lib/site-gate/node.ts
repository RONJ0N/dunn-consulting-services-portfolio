import { createHmac, timingSafeEqual } from "crypto";
import { getSiteGateSecret, SITE_GATE_TTL_MS } from "./config";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function signExpiry(expiresAt: number): string {
  return createHmac("sha256", getSiteGateSecret())
    .update(String(expiresAt))
    .digest("hex");
}

export function createSiteGateToken(): string {
  const expiresAt = Date.now() + SITE_GATE_TTL_MS;
  return `${expiresAt}.${signExpiry(expiresAt)}`;
}

export function validateSiteGateToken(token: string | undefined): boolean {
  if (!token) {
    return false;
  }

  const separator = token.lastIndexOf(".");
  if (separator <= 0) {
    return false;
  }

  const expiryStr = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expiresAt = Number(expiryStr);

  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return false;
  }

  return safeEqual(signature, signExpiry(expiresAt));
}

export function verifySitePassword(password: string): boolean {
  const expected = process.env.SITE_PASSWORD?.trim();
  if (!expected) {
    return true;
  }

  const a = Buffer.from(password);
  const b = Buffer.from(expected);

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}
