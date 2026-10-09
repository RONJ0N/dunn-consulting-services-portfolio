import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { adminCredential } from "./credentials";

const ADMIN_COOKIE = "gym_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function getAdminSecret(): string {
  return adminCredential("ADMIN_SESSION_SECRET", "local-demo-session-secret");
}

function signExpiry(expiresAt: number): string {
  return createHmac("sha256", getAdminSecret())
    .update(String(expiresAt))
    .digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export function createAdminSession(): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  return `${expiresAt}.${signExpiry(expiresAt)}`;
}

export function validateAdminSession(token: string | undefined): boolean {
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

export function clearAdminSession(): void {
  // Stateless cookie — clearing the cookie is enough.
}

export function verifyAdminPassword(password: string): boolean {
  const expected = adminCredential("ADMIN_PASSWORD", "demo-admin", 16);
  const a = Buffer.from(password);
  const b = Buffer.from(expected);

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

export async function getAdminSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_COOKIE)?.value;
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const token = await getAdminSessionToken();
  return validateAdminSession(token);
}

export { ADMIN_COOKIE, SESSION_TTL_MS };
