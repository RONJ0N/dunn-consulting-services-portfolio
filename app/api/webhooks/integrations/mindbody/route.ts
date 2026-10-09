import { markCrmSigned } from "@/lib/integrations/crm-match";
import {
  gymIdFromHeader,
  verifyWebhookSignature,
} from "@/lib/integrations/webhook-auth";

/**
 * Mindbody Public API webhook receiver.
 * Configure your Mindbody webhook to POST here with subscription events
 * like `client.created` or `client.contractAgreed`.
 *
 * Required headers / payload validation will depend on your Mindbody plan;
 * the receiver below extracts the most common fields and matches by phone.
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

    const client = (payload.client ?? payload) as Record<string, unknown>;
    const phone =
      (client.mobilePhone as string | undefined) ??
      (client.phone as string | undefined) ??
      (client.workPhone as string | undefined);
    const email = client.email as string | undefined;
    const name = [client.firstName, client.lastName]
      .filter(Boolean)
      .join(" ");

    if (!phone && !email && !name) {
      return Response.json({ ok: false, reason: "No identifiable client fields" });
    }

    const lead = await markCrmSigned(
      { gymId, phone, email, name: name.trim() || undefined },
      "mindbody",
    );

    if (!lead) {
      return Response.json({ ok: true, matched: false });
    }
    return Response.json({ ok: true, matched: true, leadId: lead.id });
  } catch (error) {
    console.error("[mindbody webhook]", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
