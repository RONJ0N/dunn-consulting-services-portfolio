import { markCrmSigned } from "@/lib/integrations/crm-match";
import {
  gymIdFromHeader,
  verifyWebhookSignature,
} from "@/lib/integrations/webhook-auth";

/**
 * Glofox webhook receiver. Configure Glofox to POST `member.created`
 * or `payment.received` events here.
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

    const member = (payload.member ?? payload) as Record<string, unknown>;
    const phone =
      (member.phoneNumber as string | undefined) ??
      (member.mobilePhone as string | undefined) ??
      (member.phone as string | undefined);
    const email = member.email as string | undefined;
    const name = [member.firstName, member.lastName]
      .filter(Boolean)
      .join(" ");

    const lead = await markCrmSigned(
      { gymId, phone, email, name: name.trim() || undefined },
      "glofox",
    );

    return Response.json({
      ok: true,
      matched: Boolean(lead),
      leadId: lead?.id ?? null,
    });
  } catch (error) {
    console.error("[glofox webhook]", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
