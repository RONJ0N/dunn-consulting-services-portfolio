import { createHmac, timingSafeEqual } from "crypto";

/**
 * Authentication for inbound CRM integration webhooks
 * (/api/webhooks/integrations/*).
 *
 * These routes mutate lead pipeline state, so they must not accept anonymous
 * POSTs. We verify an HMAC-SHA256 signature of the raw request body against a
 * shared secret, supporting a global secret and optional per-gym overrides.
 *
 * Env:
 *   INTEGRATIONS_WEBHOOK_SECRET                  global shared secret
 *   INTEGRATIONS_WEBHOOK_SECRET_<GYM_ID>         per-gym override (gymId upper
 *                                                snake-cased, e.g. ACME_HVAC)
 *   INTEGRATIONS_WEBHOOK_ALLOW_UNSIGNED=true     explicit opt-out (dev only)
 *
 * The sender computes: hex(HMAC_SHA256(secret, rawBody)) and sends it in one of
 * `x-webhook-signature`, `x-signature`, or `x-hub-signature-256` (an optional
 * `sha256=` prefix is accepted).
 */

const SIGNATURE_HEADERS = [
  "x-webhook-signature",
  "x-signature",
  "x-hub-signature-256",
];

function perGymEnvKey(gymId: string): string {
  return `INTEGRATIONS_WEBHOOK_SECRET_${gymId
    .replace(/[^a-z0-9]+/gi, "_")
    .toUpperCase()}`;
}

function getSecret(gymId?: string): string | null {
  if (gymId) {
    const override = process.env[perGymEnvKey(gymId)];
    if (override) return override;
  }
  return process.env.INTEGRATIONS_WEBHOOK_SECRET || null;
}

export interface WebhookVerifyResult {
  ok: boolean;
  status: number;
  error?: string;
}

export function verifyWebhookSignature(
  request: Request,
  rawBody: string,
  gymId?: string,
): WebhookVerifyResult {
  const secret = getSecret(gymId);

  if (!secret) {
    // No secret configured. Allow only when explicitly opted out or in dev;
    // fail closed in production so we never accept unauthenticated mutations.
    if (
      process.env.INTEGRATIONS_WEBHOOK_ALLOW_UNSIGNED === "true" ||
      process.env.NODE_ENV !== "production"
    ) {
      return { ok: true, status: 200 };
    }
    return {
      ok: false,
      status: 503,
      error: "Webhook secret not configured",
    };
  }

  let provided = "";
  for (const header of SIGNATURE_HEADERS) {
    const value = request.headers.get(header);
    if (value) {
      provided = value;
      break;
    }
  }

  if (!provided) {
    return { ok: false, status: 401, error: "Missing webhook signature" };
  }

  const normalized = provided.replace(/^sha256=/i, "").trim();
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(normalized);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Invalid webhook signature" };
  }

  return { ok: true, status: 200 };
}

/**
 * Reads gymId from the standard `x-gym-id` header (used for per-gym secret
 * selection before the JSON body is parsed).
 */
export function gymIdFromHeader(request: Request): string | undefined {
  return request.headers.get("x-gym-id") ?? undefined;
}
