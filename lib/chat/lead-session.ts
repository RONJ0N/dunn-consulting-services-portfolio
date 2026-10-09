import { eq } from "drizzle-orm";
import { withTenantContext } from "@/lib/db/tenant-db";
import {
  chatSessions,
  type ChatSession,
  type CaptureLeadStatus,
} from "@/lib/db/schema";
import type { LeadClassifierAction } from "./lead-classifier";
import type { LeadCaptureSettings } from "../gym/lead-capture-config";
import {
  getCompleteFollowUpForSession,
  getGoalsPromptForSession,
} from "../gym/lead-capture-config";
import {
  isAffirmativeOnly,
  isValidEmail,
  isValidGoals,
  isValidName,
  validationHint,
} from "./lead-validation";

/**
 * A stored lead name is "obviously bad" if it looks like a question, has too
 * many words, contains punctuation that names don't have, or is suspiciously
 * long. Seen in the wild when an earlier bug stored "give me a full rundown
 * on the gym..." as the lead name.
 */
function looksLikeCorruptedLeadName(name: string | null): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > 60) return true;
  if (/[?,]|\b(what|how|when|where|why|give|tell|show|need|want)\b/i.test(trimmed))
    return true;
  if (trimmed.split(/\s+/).length > 4) return true;
  return false;
}

/**
 * Thrown when a sessionId is reused against a different gymId than the one it
 * was created under. Prevents a client from binding another tenant's session
 * (cross-tenant takeover / data bleed). Callers should map this to a 403.
 */
export class SessionGymMismatchError extends Error {
  constructor(
    readonly sessionId: string,
    readonly expectedGymId: string,
    readonly actualGymId: string,
  ) {
    super("Session does not belong to this gym");
    this.name = "SessionGymMismatchError";
  }
}

export async function getOrCreateSession(
  sessionId: string,
  gymId: string,
): Promise<ChatSession> {
  // chat_sessions is RLS-gated; read inside the tenant context.
  const existing = await withTenantContext(gymId, (tx) =>
    tx
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1),
  );

  if (existing[0]) {
    // Reject reuse of a session id that belongs to a different tenant.
    if (existing[0].gymId !== gymId) {
      throw new SessionGymMismatchError(sessionId, gymId, existing[0].gymId);
    }
    // Defensive scrub: if a prior buggy run saved a question as the lead
    // name, reset the lead capture state on the next interaction so the
    // session can recover instead of compounding the bad data.
    if (looksLikeCorruptedLeadName(existing[0].leadName)) {
      return updateSession(existing[0].id, gymId, {
        leadStatus: "idle",
        leadName: null,
        leadPhone: null,
        leadEmail: null,
        leadGoals: null,
      });
    }
    return existing[0];
  }

  const now = new Date();
  const session: ChatSession = {
    id: sessionId,
    gymId,
    leadName: null,
    leadPhone: null,
    leadEmail: null,
    leadGoals: null,
    leadStatus: "idle",
    createdAt: now,
    updatedAt: now,
  };

  await withTenantContext(gymId, (tx) =>
    tx.insert(chatSessions).values(session),
  );
  return session;
}

export async function updateSession(
  sessionId: string,
  gymId: string,
  updates: Partial<
    Pick<ChatSession, "leadName" | "leadPhone" | "leadEmail" | "leadGoals" | "leadStatus">
  >,
): Promise<ChatSession> {
  const now = new Date();
  return withTenantContext(gymId, async (tx) => {
    await tx
      .update(chatSessions)
      .set({ ...updates, updatedAt: now })
      .where(eq(chatSessions.id, sessionId));

    const rows = await tx
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);

    return rows[0];
  });
}

export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  // Real phone numbers only contain digits, spaces, hyphens, parentheses,
  // dots, and an optional single leading "+". The first non-whitespace
  // character must be a digit, "+", or "(" — never "-" — to prevent
  // negative numbers from being silently coerced to phone digits.
  if (!/^(\+|\(|\d)[\d\s().+-]*$/.test(trimmed)) {
    return null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return digits;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return null;
}

export function formatPhone(phone: string): string {
  if (phone.length === 10) {
    return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
  }
  return phone;
}

export function isLeadCaptureActive(status: CaptureLeadStatus): boolean {
  return (
    status === "collecting_name" ||
    status === "collecting_phone" ||
    status === "collecting_email" ||
    status === "collecting_goals"
  );
}

export async function resetLeadSession(session: ChatSession): Promise<ChatSession> {
  return updateSession(session.id, session.gymId, {
    leadStatus: "idle",
    leadName: null,
    leadPhone: null,
    leadEmail: null,
    leadGoals: null,
  });
}

const TOUR_INTENT_RE =
  /\b(book|schedule|take|see|visit|want).{0,20}\b(tour|visit)\b|\b(tour|come in|swing by)\b/i;
const SIGNUP_INTENT_RE =
  /\b(sign (me )?up|join now|enroll|start my membership|i('?ll| want to) join|get me signed up|become a member|ready to join)\b/i;
const CALLBACK_INTENT_RE =
  /\b(call me( back)?|callback|can someone call|have someone call)\b/i;
const DAYPASS_INTENT_RE =
  /\b(free day pass|day pass|free trial|1-day pass|claim (my |a )?(free )?(pass|trial)|start my (free )?trial)\b/i;

export function detectLeadIntent(
  userMessage: string,
): "tour" | "signup" | "callback" | "day_pass" | "general" {
  const t = userMessage.toLowerCase();
  if (SIGNUP_INTENT_RE.test(t)) return "signup";
  if (CALLBACK_INTENT_RE.test(t)) return "callback";
  if (DAYPASS_INTENT_RE.test(t)) return "day_pass";
  if (TOUR_INTENT_RE.test(t)) return "tour";
  return "general";
}

export async function startLeadSession(
  session: ChatSession,
  userMessage?: string,
  settings?: LeadCaptureSettings,
): Promise<ChatSession> {
  if (session.leadStatus !== "idle") {
    return session;
  }

  const collectEmail = settings?.collectEmail ?? true;

  // Store the lead's intent as a hint in leadGoals so staff can see what
  // they wanted when following up. Gets overwritten by their real goals later.
  const intent = userMessage ? detectLeadIntent(userMessage) : "general";
  const intentHint =
    intent === "signup"
      ? "[Wants to sign up]"
      : intent === "callback"
        ? "[Requested callback]"
        : intent === "day_pass"
          ? "[Wants free day pass / trial]"
          : intent === "tour"
            ? "[Wants to book a tour]"
            : null;

  // Skip ahead to the earliest missing field.
  if (collectEmail && session.leadName && session.leadPhone && session.leadEmail) {
    return updateSession(session.id, session.gymId, {
      leadStatus: "collecting_goals",
      leadGoals: intentHint ?? session.leadGoals,
    });
  }

  if (
    session.leadName &&
    session.leadPhone &&
    (!collectEmail || session.leadEmail)
  ) {
    return updateSession(session.id, session.gymId, {
      leadStatus: "collecting_goals",
      leadGoals: intentHint ?? session.leadGoals,
    });
  }

  if (session.leadName && session.leadPhone && collectEmail) {
    return updateSession(session.id, session.gymId, {
      leadStatus: "collecting_email",
      leadGoals: intentHint ?? session.leadGoals,
    });
  }

  if (session.leadName) {
    return updateSession(session.id, session.gymId, {
      leadStatus: "collecting_phone",
      leadGoals: intentHint ?? session.leadGoals,
    });
  }

  return updateSession(session.id, session.gymId, {
    leadStatus: "collecting_name",
    leadGoals: intentHint ?? session.leadGoals,
  });
}

export interface ReplayLeadFieldsResult {
  status: CaptureLeadStatus;
  leadName: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  leadGoals: string | null;
}

export function replayLeadFieldsFromUserMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  settings?: LeadCaptureSettings,
): ReplayLeadFieldsResult {
  const collectEmail = settings?.collectEmail ?? true;
  let status: CaptureLeadStatus = "collecting_name";
  let leadName: string | null = null;
  let leadPhone: string | null = null;
  let leadEmail: string | null = null;
  let leadGoals: string | null = null;

  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }

    if (status === "collecting_name") {
      const content = message.content.trim();
      const words = content.split(/\s+/).filter(Boolean);
      const looksLikeSentence = words.length > 5 || /[,?]/.test(content);
      if (isValidName(content) && !looksLikeSentence) {
        leadName = content;
        status = "collecting_phone";
      }
      continue;
    }

    if (status === "collecting_phone") {
      const normalized = normalizePhone(message.content);
      if (normalized) {
        leadPhone = normalized;
        status = collectEmail ? "collecting_email" : "collecting_goals";
      }
      continue;
    }

    if (collectEmail && status === "collecting_email") {
      const trimmed = message.content.trim();
      if (isValidEmail(trimmed)) {
        leadEmail = trimmed.toLowerCase();
        status = "collecting_goals";
      }
      continue;
    }

    if (status === "collecting_goals" && isValidGoals(message.content)) {
      leadGoals = message.content.trim();
    }
  }

  return { status, leadName, leadPhone, leadEmail, leadGoals };
}

/**
 * Replay prior user messages to rebuild field progress for a session that is
 * already mid-capture (collecting_name / collecting_phone / collecting_goals).
 *
 * IMPORTANT: This must NOT be called when the session is idle. The sync
 * scans general conversation history for text that looks like a name, which
 * produces false positives (e.g. "give me the rundown on the gym" passes
 * isValidName and gets saved as the lead's name). When the classifier issues
 * a "start" the session always begins fresh at collecting_name — no backfill.
 */
export async function syncLeadFieldsFromConversation(
  session: ChatSession,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  settings?: LeadCaptureSettings,
): Promise<ChatSession> {
  // Never sync a completed session or an idle one.
  if (session.leadStatus === "complete" || session.leadStatus === "idle") {
    return session;
  }

  // Find the index of the first assistant message that asked for the lead's
  // name — we only replay messages that arrived AFTER capture started.
  const captureStartIndex = messages.findIndex(
    (message) =>
      message.role === "assistant" &&
      /\b(full name|your name|may I (get|have) your name|what('s| is) your name)\b/i.test(
        message.content,
      ),
  );

  // If we can't find where capture started, fall back to replaying only the
  // last 6 messages to avoid false positives from early conversation turns.
  const startFrom =
    captureStartIndex >= 0 ? captureStartIndex : Math.max(0, messages.length - 6);
  const relevantMessages = messages.slice(startFrom, -1);
  const replay = replayLeadFieldsFromUserMessages(relevantMessages, settings);

  if (
    replay.status === session.leadStatus &&
    replay.leadName === session.leadName &&
    replay.leadPhone === session.leadPhone &&
    replay.leadEmail === session.leadEmail &&
    replay.leadGoals === session.leadGoals
  ) {
    return session;
  }

  return updateSession(session.id, session.gymId, {
    leadStatus: replay.status,
    leadName: replay.leadName ?? session.leadName,
    leadPhone: replay.leadPhone ?? session.leadPhone,
    leadEmail: replay.leadEmail ?? session.leadEmail,
    leadGoals: replay.leadGoals ?? session.leadGoals,
  });
}

export interface AdvanceLeadResult {
  session: ChatSession;
  completedLead: {
    name: string;
    phone: string;
    email: string;
    goals: string;
  } | null;
  phoneInvalid: boolean;
  nameInvalid: boolean;
  emailInvalid: boolean;
  goalsInvalid: boolean;
  validationNote: string;
}

export async function advanceLeadSession(
  session: ChatSession,
  userMessage: string,
  classifierAction: LeadClassifierAction,
  settings: LeadCaptureSettings,
): Promise<AdvanceLeadResult> {
  const collectEmail = settings.collectEmail;
  const trimmed = userMessage.trim();
  const status = session.leadStatus as CaptureLeadStatus;
  const emptyValidation = {
    phoneInvalid: false,
    nameInvalid: false,
    emailInvalid: false,
    goalsInvalid: false,
    validationNote: "",
  };

  if (status === "complete") {
    return {
      session,
      completedLead: null,
      ...emptyValidation,
    };
  }

  if (classifierAction === "reset" && isLeadCaptureActive(status)) {
    session = await resetLeadSession(session);
    return {
      session,
      completedLead: null,
      ...emptyValidation,
    };
  }

  if (status === "idle" && classifierAction === "start") {
    session = await startLeadSession(session, trimmed, settings);
    return {
      session,
      completedLead: null,
      ...emptyValidation,
    };
  }

  if (status === "collecting_name") {
    if (!isValidName(trimmed)) {
      return {
        session,
        completedLead: null,
        nameInvalid: true,
        phoneInvalid: false,
        emailInvalid: false,
        goalsInvalid: false,
        validationNote: validationHint("name"),
      };
    }

    session = await updateSession(session.id, session.gymId, {
      leadName: trimmed,
      leadStatus: "collecting_phone",
    });
    return {
      session,
      completedLead: null,
      ...emptyValidation,
    };
  }

  if (status === "collecting_phone") {
    const normalized = normalizePhone(trimmed);
    if (!normalized) {
      return {
        session,
        completedLead: null,
        nameInvalid: false,
        phoneInvalid: true,
        emailInvalid: false,
        goalsInvalid: false,
        validationNote:
          "The phone number provided was invalid. Politely ask for a valid 10-digit US phone number.",
      };
    }

    session = await updateSession(session.id, session.gymId, {
      leadPhone: normalized,
      leadStatus: collectEmail ? "collecting_email" : "collecting_goals",
    });
    return {
      session,
      completedLead: null,
      ...emptyValidation,
    };
  }

  if (status === "collecting_email") {
    if (!collectEmail) {
      return {
        session,
        completedLead: null,
        ...emptyValidation,
      };
    }

    if (!isValidEmail(trimmed)) {
      return {
        session,
        completedLead: null,
        nameInvalid: false,
        phoneInvalid: false,
        emailInvalid: true,
        goalsInvalid: false,
        validationNote: validationHint("email"),
      };
    }

    session = await updateSession(session.id, session.gymId, {
      leadEmail: trimmed.toLowerCase(),
      leadStatus: "collecting_goals",
    });
    return {
      session,
      completedLead: null,
      ...emptyValidation,
    };
  }

  if (status === "collecting_goals") {
    let goalsAnswer = trimmed;

    if (isAffirmativeOnly(trimmed)) {
      if (session.leadGoals && isValidGoals(session.leadGoals)) {
        goalsAnswer = session.leadGoals;
      } else {
        return {
          session,
          completedLead: null,
          nameInvalid: false,
          phoneInvalid: false,
          emailInvalid: false,
          goalsInvalid: true,
          validationNote: settings.affirmativeGoalsHint,
        };
      }
    } else if (!isValidGoals(trimmed)) {
      return {
        session,
        completedLead: null,
        nameInvalid: false,
        phoneInvalid: false,
        emailInvalid: false,
        goalsInvalid: true,
        validationNote: settings.goalsValidationHint,
      };
    }

    const name = session.leadName ?? "";
    const phone = session.leadPhone ?? "";
    const email = session.leadEmail ?? "";

    if (!name || !phone || (collectEmail && !email)) {
      return {
        session,
        completedLead: null,
        ...emptyValidation,
        validationNote:
          "Lead capture is missing name, phone, or email. Ask for any missing fields before confirming.",
      };
    }

    return {
      session,
      completedLead: { name, phone, email, goals: goalsAnswer },
      ...emptyValidation,
    };
  }

  return {
    session,
    completedLead: null,
    ...emptyValidation,
  };
}

export async function markLeadSessionComplete(
  sessionId: string,
  gymId: string,
  goals: string,
): Promise<ChatSession> {
  return updateSession(sessionId, gymId, {
    leadGoals: goals,
    leadStatus: "complete",
  });
}

export function getLeadStep(
  status: CaptureLeadStatus,
  settings?: LeadCaptureSettings,
): number | null {
  const collectEmail = settings?.collectEmail ?? true;
  switch (status) {
    case "collecting_name":
      return 1;
    case "collecting_phone":
      return 2;
    case "collecting_email":
      return collectEmail ? 3 : null;
    case "collecting_goals":
      return collectEmail ? 4 : 3;
    default:
      return null;
  }
}

export function getLeadFieldForStatus(
  status: CaptureLeadStatus,
): "name" | "phone" | "email" | "goals" | null {
  switch (status) {
    case "collecting_name":
      return "name";
    case "collecting_phone":
      return "phone";
    case "collecting_email":
      return "email";
    case "collecting_goals":
      return "goals";
    default:
      return null;
  }
}

function intentLabel(goals: string | null): string {
  if (!goals) return "";
  if (goals.includes("[Wants to sign up]")) return "sign up";
  if (goals.includes("[Requested callback]")) return "callback";
  if (goals.includes("[Wants free day pass / trial]")) return "day pass / trial";
  if (goals.includes("[Wants to book a tour]")) return "tour";
  return "";
}

export function buildLeadStatePrompt(
  session: ChatSession,
  settings: LeadCaptureSettings,
): string {
  const status = session.leadStatus as CaptureLeadStatus;
  const intent = intentLabel(session.leadGoals);
  const intentNote = intent ? ` (they asked to: ${intent})` : "";
  const collectEmail = settings.collectEmail;
  const goalsPrompt = getGoalsPromptForSession(settings, session.leadGoals);

  if (status === "idle") {
    return "";
  }

  if (status === "collecting_name") {
    return `Lead capture is ACTIVE${intentNote} — the customer is ready to proceed. Ask for their full name only (first and last). Do not ask for phone${collectEmail ? ", email," : ""} or what they need help with yet. Never claim follow-up is complete. If they ask a question instead, answer briefly then redirect to their name.`;
  }

  if (status === "collecting_phone") {
    return `Lead capture is ACTIVE${intentNote}. You already have their name (${session.leadName}). Ask for their phone number only. Do not ask for ${collectEmail ? "email or " : ""}what they need help with yet. Do not confirm submission yet.`;
  }

  if (status === "collecting_email") {
    if (!collectEmail) {
      return "";
    }
    return `Lead capture is ACTIVE${intentNote}. You already have their name (${session.leadName}) and phone (${formatPhone(session.leadPhone ?? "")}). Ask for their email address so we can follow up. Do not ask what they need help with yet. Do not confirm submission yet.`;
  }

  if (status === "collecting_goals") {
    const collected =
      collectEmail && session.leadEmail
        ? `name (${session.leadName}), phone (${formatPhone(session.leadPhone ?? "")}), and email (${session.leadEmail})`
        : `name (${session.leadName}) and phone (${formatPhone(session.leadPhone ?? "")})`;
    const membershipHelp =
      !settings.goalsPrompt.trim() && collectEmail
        ? " If they ask which membership to choose, compare tiers using business information, then ask which tier they want."
        : "";
    return `Lead capture is ACTIVE${intentNote}. You already have ${collected}. ${goalsPrompt} Do not confirm follow-up is complete until the system marks capture complete.${membershipHelp} Do not collect name/phone${collectEmail ? "/email" : ""} again.`;
  }

  if (status === "complete") {
    const followUp = getCompleteFollowUpForSession(settings, session.leadGoals);
    return `Lead capture is complete. Tell them: "${followUp}" Do not re-ask for contact details.`;
  }

  return "";
}
