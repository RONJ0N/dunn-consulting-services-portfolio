import { getGymConfig, type GymConfig } from "@/lib/gym/config";
import { ensureGymLoaded } from "@/lib/gym/db-config";
import { getLeadRepository } from "@/lib/db/repository";
import { notifyLeadCaptured } from "@/lib/notifications/outbound";

export interface MissedCallResult {
  handled: boolean;
  smsSent: boolean;
  reason?: string;
}

/**
 * The missed-call flow: when an inbound call to a client's tracked number
 * isn't answered, record the caller as a lead and email the business owner.
 *
 * Previously this flow sent an automatic SMS text-back to the caller.  Since
 * the app now uses Resend for email and we don't have the caller's email
 * address, we can't contact the caller directly.  Instead the owner receives
 * an email alert so they can follow up manually.
 */
export async function handleMissedCall(
  gymId: string,
  callerPhone: string,
): Promise<MissedCallResult> {
  await ensureGymLoaded(gymId);

  let config: GymConfig;
  try {
    config = getGymConfig(gymId);
  } catch {
    return { handled: false, smsSent: false, reason: `Unknown tenant ${gymId}` };
  }

  if (!config.missedCall?.enabled) {
    return {
      handled: false,
      smsSent: false,
      reason: "missedCall.enabled is false for this tenant",
    };
  }

  const repository = getLeadRepository();
  const normalizedPhone = callerPhone.replace(/\D/g, "").slice(-10);

  // Don't re-notify about the same caller we captured within the last 24 h.
  const recent = await repository.findRecentByPhone(gymId, normalizedPhone, 24);
  if (recent) {
    return {
      handled: true,
      smsSent: false,
      reason: "Caller already captured in the last 24h",
    };
  }

  const lead = await repository.create({
    gymId,
    name: "Missed caller",
    phone: normalizedPhone,
    goals: "[Missed call — owner notified by email; follow up manually]",
    source: "missed-call",
  });

  try {
    await notifyLeadCaptured(lead);
  } catch (error) {
    console.error("[missed-call] owner notify failed", error);
  }

  console.log("[missed-call] handled", {
    gymId,
    phone: normalizedPhone,
    ownerNotified: true,
  });

  return { handled: true, smsSent: false, reason: "Owner notified by email" };
}
