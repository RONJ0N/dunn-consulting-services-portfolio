import { cookies } from "next/headers";
import { z } from "zod";
import {
  authenticateGymAdmin,
  createGymAdminSessionToken,
  GYM_ADMIN_COOKIE_NAME,
  SESSION_TTL_MS,
} from "@/lib/admin/gym-auth";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { ADMIN_LOGIN_RATE_LIMIT_POLICY } from "@/lib/rate-limit-policies";

const loginSchema = z.object({
  gymId: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = await rateLimit(
    `admin-login:${ip}`,
    ADMIN_LOGIN_RATE_LIMIT_POLICY.ip.limit,
    ADMIN_LOGIN_RATE_LIMIT_POLICY.ip.windowMs,
  );
  if (!limit.allowed) {
    return rateLimitResponse(limit.retryAfterMs);
  }

  try {
    const body = await request.json();
    const { gymId, email, password } = loginSchema.parse(body);

    const user = await authenticateGymAdmin(gymId, email, password);
    if (!user) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = createGymAdminSessionToken({
      userId: user.id,
      gymId: user.gymId,
      role: user.role,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });

    const cookieStore = await cookies();
    cookieStore.set(GYM_ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
      path: "/",
    });

    return Response.json({
      ok: true,
      user: {
        id: user.id,
        gymId: user.gymId,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: error.flatten() }, { status: 400 });
    }
    console.error(error);
    return Response.json({ error: "Login failed" }, { status: 500 });
  }
}

export async function GET() {
  const { getGymAdminSession } = await import("@/lib/admin/gym-auth");
  const session = await getGymAdminSession();
  if (!session) {
    return Response.json({ error: "No session" }, { status: 401 });
  }
  return Response.json({
    ok: true,
    user: { gymId: session.gymId, role: session.role },
  });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(GYM_ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return Response.json({ ok: true });
}
