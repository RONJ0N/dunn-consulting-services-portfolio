import { cookies } from "next/headers";
import { z } from "zod";
import {
  isSiteGateEnabled,
  SITE_GATE_COOKIE,
  SITE_GATE_TTL_MS,
} from "@/lib/site-gate/config";
import {
  createSiteGateToken,
  validateSiteGateToken,
  verifySitePassword,
} from "@/lib/site-gate/node";

const bodySchema = z.object({
  password: z.string().min(1),
});

export async function GET() {
  if (!isSiteGateEnabled()) {
    return Response.json({ enabled: false, authenticated: true });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SITE_GATE_COOKIE)?.value;
  return Response.json({
    enabled: true,
    authenticated: validateSiteGateToken(token),
  });
}

export async function POST(request: Request) {
  if (!isSiteGateEnabled()) {
    return Response.json({ ok: true, disabled: true });
  }

  try {
    const body = await request.json();
    const { password } = bodySchema.parse(body);

    if (!verifySitePassword(password)) {
      return Response.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = createSiteGateToken();
    const cookieStore = await cookies();
    cookieStore.set(SITE_GATE_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: Math.floor(SITE_GATE_TTL_MS / 1000),
      path: "/",
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: error.flatten() }, { status: 400 });
    }
    console.error(error);
    return Response.json({ error: "Login failed" }, { status: 500 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SITE_GATE_COOKIE);
  return Response.json({ ok: true });
}
