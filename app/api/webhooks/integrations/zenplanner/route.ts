import { markCrmSigned } from "@/lib/integrations/crm-match";
import {
  gymIdFromHeader,
  verifyWebhookSignature,
} from "@/lib/integrations/webhook-auth";

/**
 * Zen Planner webhook receiver. Configure ZP to POST membership creation
 * events here (their webhook docs name it slightly differently per plan).
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const auth = verifyWebhookSignature(
      request,
      rawBody,
      gymIdFromHeader(request),
    );
    if (!auth.ok) {
      return Response.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const payload = JSON.parse(rawBody || "{}") as Record<string, unknown>;
    const gymId =
      request.headers.get("x-gym-id") ??
      (typeof payload.gymId === "string" ? payload.gymId : undefined) ??
      process.env.DEFAULT_GYM_ID ??
      "demo-gym";

    const person = (payload.person ?? payload.member ?? payload) as Record<string, unknown>;
    const phone =
      (person.cellPhone as string | undefined) ??
      (person.phone as string | undefined) ??
      (person.mobile as string | undefined);
    const email = person.email as string | undefined;
    const name = [person.firstName, person.lastName]
      .filter(Boolean)
      .join(" ");

    const lead = await markCrmSigned(
      { gymId, phone, email, name: name.trim() || undefined },
      "zenplanner",
    );

    return Response.json({
      ok: true,
      matched: Boolean(lead),
      leadId: lead?.id ?? null,
    });
  } catch (error) {
    console.error("[zenplanner webhook]", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
