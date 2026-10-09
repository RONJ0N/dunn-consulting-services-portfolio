import { z } from "zod";
import { getDashboardAccess } from "@/lib/admin/authz";
import { getLeadRepository } from "@/lib/db/repository";
import { ensureGymLoaded } from "@/lib/gym/db-config";
import { isRegisteredGym } from "@/lib/gym/registry";
import { notifyLeadCaptured } from "@/lib/notifications";
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { LEADS_RATE_LIMIT_POLICY } from "@/lib/rate-limit-policies";

const leadSchema = z.object({
  gymId: z.string().min(1),
  sessionId: z.string().min(8).max(64).optional(),
  name: z.string().min(1).max(100),
  phone: z.string().min(7).max(20),
  email: z.string().email().optional(),
  goals: z.string().min(1).max(500),
  source: z.string().optional(),
  conversationSummary: z.string().max(5000).optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gymId = searchParams.get("gymId") ?? "demo-gym";

  const access = await getDashboardAccess(gymId);
  if (!access) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repository = getLeadRepository();
  const leads =
    searchParams.get("all") === "true" && access.scope === "global"
      ? await repository.listAll()
      : await repository.list(gymId);

  return Response.json({ leads });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = leadSchema.parse(body);

    const ip = getClientIp(request);
    const sessionKey = parsed.sessionId ?? `ip:${ip}`;

    const [sessionLimit, gymLimit] = await Promise.all([
      rateLimit(
        `leads:session:${sessionKey}`,
        LEADS_RATE_LIMIT_POLICY.session.limit,
        LEADS_RATE_LIMIT_POLICY.session.windowMs,
      ),
      rateLimit(
        `leads:gym:${parsed.gymId}`,
        LEADS_RATE_LIMIT_POLICY.gym.limit,
        LEADS_RATE_LIMIT_POLICY.gym.windowMs,
      ),
    ]);

    if (!sessionLimit.allowed) {
      return rateLimitResponse(sessionLimit.retryAfterMs);
    }
    if (!gymLimit.allowed) {
      return rateLimitResponse(gymLimit.retryAfterMs);
    }

    // Only accept leads for registered tenants — otherwise anyone could spam
    // owner email alerts for arbitrary gymIds.
    if (!(await isRegisteredGym(parsed.gymId))) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    // Guarantee the gyms registry row exists (gym_id FK) before the insert.
    await ensureGymLoaded(parsed.gymId);

    const repository = getLeadRepository();

    const lead = await repository.create({
      ...parsed,
      phone: parsed.phone.replace(/\D/g, "").slice(-10),
    });

    await notifyLeadCaptured(lead);

    return Response.json({ lead }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: error.flatten() }, { status: 400 });
    }

    console.error(error);
    return Response.json({ error: "Failed to save lead" }, { status: 500 });
  }
}
