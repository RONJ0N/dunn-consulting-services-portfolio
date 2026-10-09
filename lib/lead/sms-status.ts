import { z } from "zod";
import { getStaffPhonesForGym } from "@/lib/notifications/staff";
import {
  parseLeadRefFromSms,
  parsePipelineStatusFromSms,
  PIPELINE_STATUS_LABELS,
  type PipelineStatus,
} from "@/lib/lead/pipeline";
import { getLeadRepository } from "@/lib/db/repository";
import { normalizeE164 } from "@/lib/phone";
import { CHAT_MODEL, getOpenAIClient } from "@/lib/openai";

export interface SmsStatusUpdateResult {
  ok: boolean;
  message: string;
  leadId?: string;
  status?: PipelineStatus;
  gymId?: string;
  pathway?: "staff" | "lead" | "unknown";
}

async function findLeadByPhone(
  phone: string,
  preferredGymId?: string,
) {
  const repository = getLeadRepository();
  const normalized = phone.replace(/\D/g, "").slice(-10);
  if (preferredGymId) {
    const direct = await repository.findRecentByPhone(preferredGymId, normalized, 30 * 24);
    if (direct) return direct;
  }
  // Fallback: scan all leads (small set) for a matching phone.
  const all = await repository.listAll();
  return (
    all.find((lead) => lead.phone.replace(/\D/g, "").slice(-10) === normalized) ?? null
  );
}

const leadReplyIntentSchema = z.object({
  intent: z.enum([
    "joined",
    "interested",
    "tour_booked",
    "lost",
    "no_response",
    "unrelated",
  ]),
  rationale: z.string().min(1),
});

async function classifyLeadReplyIntent(
  body: string,
): Promise<{ intent: z.infer<typeof leadReplyIntentSchema>["intent"]; rationale: string }> {
  const trimmed = body.trim();
  // Cheap deterministic rules first.
  if (/\b(signed up|joined|i joined|signed|enrolled|i'm a member)\b/i.test(trimmed)) {
    return { intent: "joined", rationale: "Deterministic: explicit join phrase." };
  }
  if (/\b(no longer interested|not interested|not gonna|pass|nevermind|never mind|going elsewhere)\b/i.test(trimmed)) {
    return { intent: "lost", rationale: "Deterministic: explicit disinterest." };
  }
  if (/\b(book(ed)? (a |the )?tour|tour booked|set up a tour|going to tour|tour tomorrow|tour next)\b/i.test(trimmed)) {
    return { intent: "tour_booked", rationale: "Deterministic: tour booking phrase." };
  }
  if (/^(yes|yeah|yep|yup|sure|interested|still interested|still considering)/i.test(trimmed)) {
    return { intent: "interested", rationale: "Deterministic: soft affirmative." };
  }

  try {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Classify a gym lead's SMS reply into one of: joined, interested, tour_booked, lost, no_response, unrelated. Output strict JSON {"intent": ..., "rationale": "..."}. "joined" = they signed up/are now a member. "interested" = still interested but undecided. "tour_booked" = they've scheduled or attended a tour. "lost" = no longer interested or went elsewhere. "no_response" = ambiguous one-word reply. "unrelated" = off topic.`,
        },
        { role: "user", content: trimmed },
      ],
    });
    const raw = response.choices[0]?.message?.content ?? "{}";
    return leadReplyIntentSchema.parse(JSON.parse(raw));
  } catch (error) {
    return {
      intent: "no_response",
      rationale: `Classifier fallback: ${error instanceof Error ? error.message : "unknown"}`,
    };
  }
}

function pipelineFromIntent(intent: string): PipelineStatus | null {
  switch (intent) {
    case "joined":
      return "signed";
    case "tour_booked":
      return "tour";
    case "interested":
      return "contacted";
    case "lost":
      return "lost";
    default:
      return null;
  }
}

export async function applyLeadStatusFromSms(
  fromPhone: string,
  body: string,
  defaultGymId = "demo-gym",
): Promise<SmsStatusUpdateResult> {
  const normalizedFrom = normalizeE164(fromPhone);
  const repository = getLeadRepository();

  // STAFF PATHWAY — explicit CONTACTED/TOUR/SIGNED/LOST commands.
  const staffPhones = getStaffPhonesForGym(defaultGymId);
  const isStaff =
    staffPhones.length > 0 &&
    staffPhones.some((phone) => phone === normalizedFrom);

  if (isStaff) {
    const status = parsePipelineStatusFromSms(body);
    if (!status) {
      return {
        ok: false,
        message: "Reply with CONTACTED, TOUR, SIGNED, or LOST (optional: REF AB12).",
        pathway: "staff",
      };
    }
    const ref = parseLeadRefFromSms(body);
    const lead = ref
      ? await repository.findByRef(ref, defaultGymId)
      : await repository.findLatestOpen(defaultGymId);
    if (!lead) {
      return {
        ok: false,
        message: "No matching lead found. Include REF code from the alert SMS.",
        pathway: "staff",
      };
    }
    const updated = await repository.updatePipelineStatus(lead.id, status, {
      source: "sms",
      actorPhone: normalizedFrom,
      note: `Staff SMS: ${body.trim().slice(0, 200)}`,
    });
    if (!updated) {
      return { ok: false, message: "Failed to update lead status.", pathway: "staff" };
    }
    return {
      ok: true,
      message: `${updated.name} marked as ${PIPELINE_STATUS_LABELS[status]}.`,
      leadId: updated.id,
      status,
      gymId: updated.gymId,
      pathway: "staff",
    };
  }

  // LEAD PATHWAY — reply from someone we previously captured as a lead.
  const matchingLead = await findLeadByPhone(fromPhone, defaultGymId);
  if (!matchingLead) {
    return {
      ok: false,
      message:
        "Thanks for the message! For immediate help, please call the gym directly.",
      pathway: "unknown",
    };
  }

  const { intent, rationale } = await classifyLeadReplyIntent(body);
  const newStatus = pipelineFromIntent(intent);

  if (newStatus && newStatus !== matchingLead.pipelineStatus) {
    await repository.updatePipelineStatus(matchingLead.id, newStatus, {
      source: "sms",
      actorPhone: normalizedFrom,
      note: `Lead reply classified as ${intent}: "${body.trim().slice(0, 160)}" — ${rationale}`,
    });
  }

  const friendlyReply =
    intent === "joined"
      ? "Awesome — welcome aboard! Our team will be in touch with next steps."
      : intent === "tour_booked"
        ? "Great, looking forward to seeing you for the tour!"
        : intent === "lost"
          ? "Totally understand. If anything changes, we're here whenever you're ready."
          : intent === "interested"
            ? "Thanks for letting us know! Anything we can help you with?"
            : "Thanks for the reply — someone from the gym will get back to you shortly.";

  return {
    ok: Boolean(newStatus),
    message: friendlyReply,
    leadId: matchingLead.id,
    status: newStatus ?? undefined,
    gymId: matchingLead.gymId,
    pathway: "lead",
  };
}
