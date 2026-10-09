import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();
const upstashLimiters = new Map<string, Ratelimit>();
let upstashRedis: Redis | null = null;
let upstashInitTried = false;

function getUpstashLimiter(limit: number, windowMs: number): Ratelimit | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  if (upstashInitTried && !upstashRedis) {
    return null;
  }
  const windowSeconds = Math.ceil(windowMs / 1000);
  const cacheKey = `${limit}:${windowSeconds}`;
  const cachedLimiter = upstashLimiters.get(cacheKey);
  if (cachedLimiter) {
    return cachedLimiter;
  }

  try {
    if (!upstashRedis) {
      upstashRedis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
    }

    const limiter = new Ratelimit({
      redis: upstashRedis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      analytics: false,
      prefix: "gym-ai-rl",
    });
    upstashLimiters.set(cacheKey, limiter);
    return limiter;
  } catch (error) {
    if (!upstashInitTried) {
      console.warn("[rate-limit] Upstash init failed, using in-memory fallback", error);
    }
    upstashInitTried = true;
    return null;
  }
}

function memoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || now >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= limit) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  buckets.set(key, entry);
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Async-safe rate limiter. Prefers Upstash when configured (multi-instance,
 * survives serverless cold starts), falls back to in-memory for local dev.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const limiter = getUpstashLimiter(limit, windowMs);
  if (limiter) {
    try {
      const result = await limiter.limit(key);
      return {
        allowed: result.success,
        retryAfterMs: Math.max(0, result.reset - Date.now()),
      };
    } catch (error) {
      console.warn("[rate-limit] Upstash limiter failed, falling back to memory", error);
    }
  }

  return memoryRateLimit(key, limit, windowMs);
}

/** @deprecated Use the async {@link rateLimit}. Kept for any existing sync callers. */
export function rateLimitSync(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number } {
  return memoryRateLimit(key, limit, windowMs);
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimitResponse(
  retryAfterMs: number,
  message = "Too many requests. Please try again shortly.",
): Response {
  return Response.json(
    { error: message },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
      },
    },
  );
}
