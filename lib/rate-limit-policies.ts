export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export const CHAT_RATE_LIMIT_POLICY = {
  session: { limit: 60, windowMs: HOUR_MS },
  gym: { limit: 300, windowMs: HOUR_MS },
  ip: { limit: 120, windowMs: HOUR_MS },
} as const satisfies Record<string, RateLimitPolicy>;

export const LEADS_RATE_LIMIT_POLICY = {
  session: { limit: 10, windowMs: HOUR_MS },
  gym: { limit: 50, windowMs: HOUR_MS },
} as const satisfies Record<string, RateLimitPolicy>;

export const ADMIN_LOGIN_RATE_LIMIT_POLICY = {
  ip: { limit: 10, windowMs: 15 * MINUTE_MS },
} as const satisfies Record<string, RateLimitPolicy>;
