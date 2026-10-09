import { rateLimit } from "@/lib/rate-limit";
import { CHAT_RATE_LIMIT_POLICY } from "@/lib/rate-limit-policies";

type LimitFailure = {
  retryAfterMs: number;
};

export async function checkChatRateLimits({
  sessionId,
  gymId,
  ip,
}: {
  sessionId: string;
  gymId: string;
  ip: string;
}): Promise<LimitFailure | null> {
  const [sessionLimit, gymLimit, ipLimit] = await Promise.all([
    rateLimit(
      `chat:session:${sessionId}`,
      CHAT_RATE_LIMIT_POLICY.session.limit,
      CHAT_RATE_LIMIT_POLICY.session.windowMs,
    ),
    rateLimit(
      `chat:gym:${gymId}`,
      CHAT_RATE_LIMIT_POLICY.gym.limit,
      CHAT_RATE_LIMIT_POLICY.gym.windowMs,
    ),
    rateLimit(
      `chat:ip:${ip}`,
      CHAT_RATE_LIMIT_POLICY.ip.limit,
      CHAT_RATE_LIMIT_POLICY.ip.windowMs,
    ),
  ]);

  if (!sessionLimit.allowed) {
    return { retryAfterMs: sessionLimit.retryAfterMs };
  }
  if (!gymLimit.allowed) {
    return { retryAfterMs: gymLimit.retryAfterMs };
  }
  if (!ipLimit.allowed) {
    return { retryAfterMs: ipLimit.retryAfterMs };
  }

  return null;
}
