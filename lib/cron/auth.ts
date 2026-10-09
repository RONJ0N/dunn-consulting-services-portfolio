import { timingSafeEqual } from "crypto";

/**
 * Authorize a cron HTTP request. Accepts either:
 * - Vercel cron's automatic `Authorization: Bearer <CRON_SECRET>` header
 * - A custom `x-cron-secret: <CRON_SECRET>` header for self-hosted setups
 *
 * Returns true when CRON_SECRET is unset (local dev) — callers should
 * still be wary about exposing the route publicly in that case.
 */
export function authorizeCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const bearer = request.headers.get("authorization");
  const direct = request.headers.get("x-cron-secret");

  for (const candidate of [
    bearer?.replace(/^Bearer\s+/i, "") ?? "",
    direct ?? "",
  ]) {
    if (!candidate) continue;
    const a = Buffer.from(candidate);
    const b = Buffer.from(secret);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return true;
    }
  }

  return false;
}
