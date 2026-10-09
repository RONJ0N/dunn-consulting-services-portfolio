import { handleMissedCall } from "@/lib/missed-call";
import { twimlResponse, verifyTwilioRequest } from "@/lib/twilio/verify";

/**
 * <Dial action> callback for the voice webhook. Twilio posts the outcome of
 * the forwarded call here; anything other than "completed"/"answered" means
 * the business missed the call — the owner is notified by email.
 */
const MISSED_STATUSES = new Set(["no-answer", "busy", "failed", "canceled"]);

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
    const dialStatus = formData.get("DialCallStatus")?.toString() ?? "";

    console.log("[voice status]", { gymId, dialStatus });

    if (caller && MISSED_STATUSES.has(dialStatus)) {
      await handleMissedCall(gymId, caller);
    }

    return twimlResponse("");
  } catch (error) {
    console.error("[voice status error]", error);
    return twimlResponse("");
  }
}
