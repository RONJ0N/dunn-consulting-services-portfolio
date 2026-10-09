import { getGymConfig, type GymConfig } from "@/lib/gym/config";
import { ensureGymLoaded, listAllGymIds } from "@/lib/gym/db-config";
import { leadRefFromId } from "@/lib/lead/pipeline";
import { getLeadRepository } from "@/lib/db/repository";
import type { Lead } from "@/lib/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_STATUSES = new Set(["new", "contacted"]);

function dayOffsetFromNow(timestamp: Date): number {
  return Math.floor((Date.now() - timestamp.getTime()) / DAY_MS);
}

function buildFollowupMessage(lead: Lead, config: GymConfig, dayOffset: number): string {
  const firstName = lead.name.split(/\s+/)[0] ?? "there";
  if (dayOffset === 1) {
    return `Hi ${firstName}, this is the ${config.name} AI assistant. Just checking in — anything I can help with as you decide? Reply YES for a quick tour.`;
  }
  if (dayOffset === 3) {
    return `Hi ${firstName}, ${config.name} here. Did you get a chance to stop by? Happy to schedule a tour or answer any last questions.`;
  }
  return `Hey ${firstName}, last check-in from ${config.name}. If you joined we'd love to hear it!`;
}

export interface FollowupRunResult {
  gymId: string;
  attempted: number;
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{
    leadId: string;
    dayOffset: number;
    status: "sent" | "skipped" | "error";
    error?: string;
  }>;
}

export async function runFollowupForGym(
  gymId: string,
): Promise<FollowupRunResult> {
  const result: FollowupRunResult = {
    gymId,
    attempted: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  let config: GymConfig;
  try {
    // Hydrate DB-onboarded tenants (no folder on disk) before the sync read.
    await ensureGymLoaded(gymId);
    config = getGymConfig(gymId);
  } catch (error) {
    console.warn(`[followup] could not load config for ${gymId}`, error);
    return result;
  }

  if (!config.followup?.enabled) {
    return result;
  }

  const dayOffsets = config.followup.dayOffsets ?? [1, 3, 7];
  const repository = getLeadRepository();
  const leads = await repository.list(gymId);

  for (const lead of leads) {
    if (!OPEN_STATUSES.has(lead.pipelineStatus)) continue;

    const offset = dayOffsetFromNow(lead.createdAt);
    if (!dayOffsets.includes(offset)) continue;

    result.attempted += 1;

    // Leads captured via chat widget only have phone numbers — not email
    // addresses.  Email follow-ups are not possible until the lead schema
    // includes an email field.  Log and skip rather than silently failing.
    const skipReason =
      "Lead has no email address (phone-only capture); email follow-up skipped.";
    console.log("[followup] skipped — no email", {
      gymId,
      leadId: lead.id,
      dayOffset: offset,
      ref: leadRefFromId(lead.id),
    });

    // Build the message so it's available in the log for manual follow-up.
    const message = buildFollowupMessage(lead, config, offset);
    console.log("[followup] suggested message for manual outreach:", message);

    result.skipped += 1;
    result.details.push({
      leadId: lead.id,
      dayOffset: offset,
      status: "skipped",
      error: skipReason,
    });
  }

  return result;
}

export async function runFollowupForAllGyms(): Promise<FollowupRunResult[]> {
  const results: FollowupRunResult[] = [];
  for (const gymId of await listAllGymIds()) {
    results.push(await runFollowupForGym(gymId));
  }
  return results;
}
