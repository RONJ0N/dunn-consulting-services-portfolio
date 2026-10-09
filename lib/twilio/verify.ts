import { createHmac } from "crypto";

/**
 * Shared Twilio webhook signature verification — implemented using Node's
 * built-in `crypto` module so the `twilio` npm package is not required.
 *
 * Algorithm (https://www.twilio.com/docs/usage/webhooks/webhooks-security):
 *  1. Take the full request URL.
 *  2. Sort POST params alphabetically and append key+value to the URL.
 *  3. HMAC-SHA1 sign the resulting string with TWILIO_AUTH_TOKEN.
 *  4. Base64-encode and compare with the X-Twilio-Signature header.
 *
 * The SKIP_TWILIO_SIGNATURE escape hatch exists only for local development.
 */

function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  const sortedKeys = Object.keys(params).sort();
  const str = url + sortedKeys.map((key) => key + params[key]).join("");
  const computed = createHmac("sha1", authToken).update(str).digest("base64");
  return computed === signature;
}

export async function verifyTwilioRequest(
  request: Request,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (process.env.SKIP_TWILIO_SIGNATURE === "true") {
    return { ok: true };
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error(
      "[twilio webhook] TWILIO_AUTH_TOKEN not set — refusing inbound request to avoid spoofing.",
    );
    return {
      ok: false,
      response: new Response("Server misconfigured", { status: 500 }),
    };
  }

  const signature = request.headers.get("x-twilio-signature") ?? "";
  if (!signature) {
    console.warn("[twilio webhook] Missing x-twilio-signature header");
    return { ok: false, response: new Response("Forbidden", { status: 403 }) };
  }

  const requestUrl = new URL(request.url);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const url = `${base.replace(/\/$/, "")}${requestUrl.pathname}${requestUrl.search}`;

  const params = Object.fromEntries(formData.entries()) as Record<string, string>;
  const valid = validateTwilioSignature(authToken, signature, url, params);
  if (!valid) {
    console.warn("[twilio webhook] Invalid signature for url", url);
    return { ok: false, response: new Response("Forbidden", { status: 403 }) };
  }

  return { ok: true };
}

export function twimlResponse(xmlBody: string): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${xmlBody}</Response>`,
    { headers: { "Content-Type": "text/xml" } },
  );
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
