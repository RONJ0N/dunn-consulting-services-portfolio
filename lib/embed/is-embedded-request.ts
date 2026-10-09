/**
 * Returns true when the request is loading the widget inside an iframe on a
 * customer site (embed.js). Direct browser navigation to /widget?gym=... in
 * production renders a blank page instead.
 *
 * Primary signal: Sec-Fetch-Dest: iframe (modern browsers).
 * Fallback: Referer origin differs from the app host (cross-site embed).
 */
export function isEmbeddedRequest(requestHeaders: Headers): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  if (process.env.ALLOW_WIDGET_PREVIEW === "true") {
    return true;
  }

  const dest = requestHeaders.get("sec-fetch-dest");
  if (dest === "iframe") {
    return true;
  }

  const referer = requestHeaders.get("referer");
  const host = requestHeaders.get("host");
  if (referer && host) {
    try {
      const refererOrigin = new URL(referer).origin;
      const proto =
        requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
        "https";
      const requestOrigin = `${proto}://${host.split(":")[0]}`;
      if (refererOrigin !== requestOrigin) {
        return true;
      }
    } catch {
      /* ignore malformed referer */
    }
  }

  return false;
}
