import { z } from "zod";
import { ADMIN_COOKIE, createAdminSession, isAdminAuthenticated, SESSION_TTL_MS, verifyAdminPassword } from "@/lib/admin/session";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { ADMIN_LOGIN_RATE_LIMIT_POLICY } from "@/lib/rate-limit-policies";

const loginSchema = z.object({
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    // Throttle password guessing — the global admin password is high value.
    const ip = getClientIp(request);
    const limit = await rateLimit(
      `admin-login:${ip}`,
      ADMIN_LOGIN_RATE_LIMIT_POLICY.ip.limit,
      ADMIN_LOGIN_RATE_LIMIT_POLICY.ip.windowMs,
    );
    if (!limit.allowed) {
      return rateLimitResponse(limit.retryAfterMs);
    }

    const body = await request.json();
    const { password } = loginSchema.parse(body);

    if (!verifyAdminPassword(password)) {
      return Response.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = createAdminSession();
    const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";

    return Response.json(
      { success: true },
      {
        headers: {
          "Set-Cookie": `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
        },
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: error.flatten() }, { status: 400 });
    }

    return Response.json({ error: "Login failed" }, { status: 500 });
  }
}

export async function DELETE() {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return Response.json(
    { success: true },
    {
      headers: {
        "Set-Cookie": `${ADMIN_COOKIE}=; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=0`,
      },
    },
  );
}

export async function GET() {
  const authed = await isAdminAuthenticated();
  if (!authed) {
    return Response.json({ authenticated: false }, { status: 401 });
  }

  return Response.json({ authenticated: true });
}
