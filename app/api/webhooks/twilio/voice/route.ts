import { getGymConfig } from "@/lib/gym/config";
import { ensureGymLoaded } from "@/lib/gym/db-config";
import { handleMissedCall } from "@/lib/missed-call";
import {
  escapeXml,
  twimlResponse,
  verifyTwilioRequest,
} from "@/lib/twilio/verify";

/**
 * Inbound voice webhook for missed-call email notification.
 *
 * Point a Twilio number's "A call comes in" webhook here with the tenant in
 * the query string: https://<app>/api/webhooks/twilio/voice?gym=<tenant-id>
 *
 * Behavior:
 * - twilio.forwardTo configured: ring the real business line for 20 s. The
 *   <Dial action> callback (./status) fires the owner email when unanswered.
 * - No forwardTo: play a short message and trigger the owner email immediately
 *   (the number acts as a dedicated tracked line).
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const verified = await verifyTwilioRequest(request, formData);
    if (!verified.ok) {
      return verified.response;
    }

    const { searchParams } = new URL(request.url);
    const gymId =
      searchParams.get("gym") ?? process.env.DEFAULT_GYM_ID ?? "demo-gym";
    const caller = formData.get("From")?.toString() ?? "";

    await ensureGymLoaded(gymId);

    let businessName = "the business";
    let forwardTo: string | undefined;
    try {
      const config = getGymConfig(gymId);
      businessName = config.name;
      forwardTo = config.twilio?.forwardTo;
    } catch {
      // Unknown tenant — answer gracefully, no notification.
    }

    if (forwardTo) {
      const action = `/api/webhooks/twilio/voice/status?gym=${encodeURIComponent(gymId)}`;
      return twimlResponse(
        `<Dial timeout="20" action="${escapeXml(action)}" method="POST">${escapeXml(forwardTo)}</Dial>`,
      );
    }

    // Dedicated tracked line: no human to ring — notify owner right away.
    if (caller) {
      // Fire-and-forget so TwiML returns fast; errors are logged inside.
      handleMissedCall(gymId, caller).catch((error) =>
        console.error("[voice webhook] missed-call notify failed", error),
      );
    }

    return twimlResponse(
      `<Say>Thanks for calling ${escapeXml(businessName)}. We have noted your call and someone will follow up with you shortly.</Say>`,
    );
  } catch (error) {
    console.error("[voice webhook error]", error);
    return twimlResponse("<Say>Sorry, something went wrong.</Say>");
  }
}
