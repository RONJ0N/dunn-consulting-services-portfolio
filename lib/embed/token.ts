import { createHmac, timingSafeEqual } from "crypto";

/**
 * Per-gym signed embed tokens.
 *
 * A real client's gymId is visible in their site HTML (it is not a secret).
 * The registry gate stops random/guessed ids, but a scraped real id could
 * still be replayed from another origin. A signed token raises that bar: the
 * admin dashboard generates an HMAC token bound to the gymId, and /api/chat +
 * /api/gym/:id/config verify it.
 *
 * Rollout-safe: verification is ENFORCED only when EMBED_TOKEN_SECRET is set
 * AND EMBED_ENFORCE_TOKEN=true. Until then tokens are generated and accepted
 * but their absence does not block requests, so existing embeds keep working.
 */

const HEADER_NAME = "x-embed-token";
const QUERY_PARAM = "token";

function getSecret(): string | null {
  return process.env.EMBED_TOKEN_SECRET || null;
}

function isEnforced(): boolean {
  return Boolean(getSecret()) && process.env.EMBED_ENFORCE_TOKEN === "true";
}

function sign(gymId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`embed:${gymId}`)
    .digest("base64url");
}

/**
 * Create a token for a gymId. Returns null when no secret is configured so the
 * dashboard can omit the data-token attribute entirely in that case.
 */
export function createEmbedToken(gymId: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  return sign(gymId, secret);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Verify a raw token string against a gymId. */
export function verifyEmbedToken(
  token: string | null | undefined,
  gymId: string,
): boolean {
  const secret = getSecret();
  if (!secret || !token) return false;
  return safeEqual(token, sign(gymId, secret));
}

/**
 * Request-level check used by public routes. Reads the token from the
 * `x-embed-token` header or `?token=` query param. Returns true (allow) when
 * enforcement is off; otherwise requires a valid token.
 */
export function verifyEmbedRequest(request: Request, gymId: string): boolean {
  if (!isEnforced()) {
    return true;
  }
  const headerToken = request.headers.get(HEADER_NAME);
  let queryToken: string | null = null;
  try {
    queryToken = new URL(request.url).searchParams.get(QUERY_PARAM);
  } catch {
    queryToken = null;
  }
  return (
    verifyEmbedToken(headerToken, gymId) || verifyEmbedToken(queryToken, gymId)
  );
}

/**
 * Check whether a widget load is coming from an allowed origin for the given
 * gym config. Called at the /widget page level using the request's Referer.
 *
 * Rules:
 *  - If the gym has no allowedOrigins configured → allow everything (backwards
 *    compat: existing tenants without the field keep working).
 *  - If allowedOrigins is non-empty → the Referer hostname must exactly match
 *    one of the listed hostnames (case-insensitive). Missing or malformed
 *    Referer is treated as a blocked request when the list is enforced.
 *  - The app's own host (app.dunnconsulting.org etc.) is always allowed so the
 *    agency admin widget preview and local dev always work.
 *
 * Note: `Referer` on the widget iframe page load reflects the PARENT page's URL
 * (the site that contains the embed snippet), which is exactly what we want to
 * validate. Browsers cannot be instructed to spoof Referer by untrusted JS.
 */
export function isAllowedEmbedOrigin(
  referer: string | null,
  appHost: string | null,
  allowedOrigins: string[],
): boolean {
  // No allow-list configured → open to all (legacy / unconfigured tenants).
  if (!allowedOrigins || allowedOrigins.length === 0) {
    return true;
  }

  // Always allow the app's own host (admin preview, local dev, same-origin).
  if (appHost) {
    const normalizedApp = appHost.split(":")[0].toLowerCase();
    if (
      normalizedApp === "localhost" ||
      normalizedApp === "127.0.0.1" ||
      // any *.vercel.app preview URL
      normalizedApp.endsWith(".vercel.app")
    ) {
      return true;
    }
  }

  if (!referer) return false;

  let refererHost: string;
  try {
    refererHost = new URL(referer).hostname.toLowerCase();
  } catch {
    return false;
  }

  // Always allow same-app origin (e.g. app.dunnconsulting.org).
  if (appHost && refererHost === appHost.split(":")[0].toLowerCase()) {
    return true;
  }

  return allowedOrigins.some((o) => o.toLowerCase() === refererHost);
}

export const EMBED_TOKEN_HEADER = HEADER_NAME;
export const EMBED_TOKEN_QUERY_PARAM = QUERY_PARAM;
