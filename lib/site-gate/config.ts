export const SITE_GATE_COOKIE = "site_gate_session";

/** 7 days — long enough to share the demo link with a gym owner */
export const SITE_GATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isSiteGateEnabled(): boolean {
  const password = process.env.SITE_PASSWORD?.trim();
  return Boolean(password && password.length > 0);
}

export function getSiteGateSecret(): string {
  return (
    process.env.SITE_GATE_SECRET?.trim() ??
    process.env.SITE_PASSWORD?.trim() ??
    "site-gate-dev-secret"
  );
}
