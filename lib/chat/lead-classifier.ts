import { z } from "zod";
import type { CaptureLeadStatus } from "@/lib/db/schema";
import { CHAT_MODEL, getOpenAIClient } from "@/lib/openai";
import { isValidGoals, isValidName } from "./lead-validation";

const classifierSchema = z.object({
  action: z.enum(["none", "start", "reset"]),
  reason: z.string().min(1),
});

export type LeadClassifierAction = z.infer<typeof classifierSchema>["action"];

export interface LeadClassifierResult {
  action: LeadClassifierAction;
  reason: string;
  allowedActions: string;
}

const AFFIRMATIVE_ONLY_PATTERN =
  /^\s*(yes|yeah|yep|yup|sure|ok|okay|absolutely|definitely|sounds good|go ahead|please)[!.?\s]*$/i;

const COMMITMENT_OFFER_PATTERN =
  /\b(book a tour|schedule a tour|gym tour|free tour|leave your name|sign up|join today|call you back|get started|ready to (join|sign up|enroll)|would you like (a |to )?(book|schedule|tour|sign up|join))\b/i;

const SOFT_INTEREST_PATTERN =
  /\b(interested in joining|thinking about joining|considering joining|might join|looking into joining|just looking|still deciding|not sure yet)\b/i;

const MEMBERSHIP_PREFERENCE_SOFT_PATTERN =
  /\b(interested in (the )?(basic|plus|premium)(\s+membership)?|leaning toward (the )?(basic|plus|premium)|prefer (the )?(basic|plus|premium)|i want (the )?(basic|plus|premium)(\s+membership)?)\b/i;

const DIRECT_COMMITMENT_PATTERN =
  /\b(book a tour|book me a tour|schedule a tour|ready to sign up|sign me up|sign up now|join now|enroll now|call me back|call me|callback|can someone call me|schedule my tour|let'?s book|start my membership|sign up for|enroll me|i('?ll| want to) (join|sign up|book)|yes (i('?d| want to)? )?(like to )?(book|join|sign up|tour|enroll)|get me signed up|get (a|the) (free )?day pass|i want a day pass|claim my (free )?(pass|trial)|start my (free )?trial)\b/i;

const GREETING_RESET_PATTERN =
  /^\s*(hi|hello|hey|good morning|good afternoon|good evening)[!.?\s]*$/i;

// FAQ-style questions a user might ask mid-capture (e.g. "what are your
// hours?" while we're collecting their phone). We answer it inline and
// stay in capture rather than treating it as a topic-change reset.
const FAQ_INTERROGATIVE_PATTERN =
  /^\s*(what|how|when|where|why|who|which|can you|can i|do you|does|is|are|will|could|would)\b.+\?\s*$|\b(hours|price|pricing|cost|membership|classes?|schedule|trainer|personal training|location|address|parking|day pass|trial|policy|cancel|guest|amenities|equipment|sauna|pool)\b/i;

function lastAssistantMessage(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant") {
      return messages[i].content;
    }
  }
  return null;
}

const MEMBERSHIP_RECOMMENDATION_PATTERN =
  /\b(which|what)\s+membership\s+(should|would|do|can)\b|\b(recommend|suggest|help me choose|help me pick)\b.*\bmembership\b|\bmembership\s+(should|would)\s+i\b/i;

function looksLikeValidPhone(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

export function isSoftLeadInterest(message: string): boolean {
  const trimmed = message.trim();

  if (DIRECT_COMMITMENT_PATTERN.test(trimmed)) {
    return false;
  }

  if (SOFT_INTEREST_PATTERN.test(trimmed)) {
    return true;
  }

  if (MEMBERSHIP_PREFERENCE_SOFT_PATTERN.test(trimmed)) {
    return true;
  }

  if (MEMBERSHIP_RECOMMENDATION_PATTERN.test(trimmed)) {
    return true;
  }

  return false;
}

function deterministicClassification(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  latestUserMessage: string,
  currentStatus: CaptureLeadStatus,
  captureActive: boolean,
  allowedActions: string,
): LeadClassifierResult | null {
  const trimmed = latestUserMessage.trim();

  if (captureActive && GREETING_RESET_PATTERN.test(trimmed)) {
    return {
      action: "reset",
      reason: "Greeting while lead capture is active — reset to idle.",
      allowedActions,
    };
  }

  if (captureActive && currentStatus === "collecting_goals") {
    if (MEMBERSHIP_RECOMMENDATION_PATTERN.test(trimmed)) {
      return {
        action: "none",
        reason:
          "Membership recommendation question while collecting preference — answer it, do not reset.",
        allowedActions,
      };
    }

    if (isValidGoals(trimmed)) {
      return {
        action: "none",
        reason: "Providing fitness goals or membership preference.",
        allowedActions,
      };
    }
  }

  if (captureActive && currentStatus === "collecting_name" && isValidName(trimmed)) {
    return {
      action: "none",
      reason: "Providing full name for lead capture.",
      allowedActions,
    };
  }

  if (
    captureActive &&
    currentStatus === "collecting_phone" &&
    looksLikeValidPhone(trimmed)
  ) {
    return {
      action: "none",
      reason: "Providing phone number for lead capture.",
      allowedActions,
    };
  }

  if (captureActive && currentStatus === "collecting_email") {
    // Any input mid-email step: answer FAQ inline, or accept the email address.
    if (FAQ_INTERROGATIVE_PATTERN.test(trimmed)) {
      return {
        action: "none",
        reason: "FAQ-style question mid-capture (email step) — answer it, stay in capture.",
        allowedActions,
      };
    }
    // Looks like a real email — accept it without LLM call.
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      return {
        action: "none",
        reason: "Providing email address for lead capture.",
        allowedActions,
      };
    }
  }

  // Mid-capture FAQ question — let the bot answer inline instead of resetting.
  // Without this, any clarifying question (e.g. "what are your hours?" while
  // we're collecting phone) kills the capture session.
  if (captureActive && FAQ_INTERROGATIVE_PATTERN.test(trimmed)) {
    return {
      action: "none",
      reason: "FAQ-style question mid-capture — answer it, stay in capture.",
      allowedActions,
    };
  }

  if (currentStatus !== "idle" || captureActive) {
    return null;
  }

  // Bare-yes guard: when the user replies "yes"/"sure"/"ok" but the most
  // recent assistant message did NOT contain a commitment offer, do NOT
  // start capture. The LLM tends to over-trigger on bare affirmatives even
  // when there was nothing to opt into.
  const assistantTextForAffirmative = lastAssistantMessage(messages);
  if (
    AFFIRMATIVE_ONLY_PATTERN.test(trimmed) &&
    (!assistantTextForAffirmative ||
      !COMMITMENT_OFFER_PATTERN.test(assistantTextForAffirmative))
  ) {
    return {
      action: "none",
      reason: "Affirmative reply without preceding commitment offer.",
      allowedActions,
    };
  }

  if (
    SOFT_INTEREST_PATTERN.test(trimmed) &&
    !DIRECT_COMMITMENT_PATTERN.test(trimmed)
  ) {
    return {
      action: "none",
      reason: "Soft interest only — continue consultative conversation.",
      allowedActions,
    };
  }

  if (isSoftLeadInterest(trimmed)) {
    return {
      action: "none",
      reason: "Exploring or comparing options — guide gently, do not capture yet.",
      allowedActions,
    };
  }

  if (DIRECT_COMMITMENT_PATTERN.test(trimmed)) {
    return {
      action: "start",
      reason: "Clear commitment to book, join, or sign up.",
      allowedActions,
    };
  }

  const assistantText = lastAssistantMessage(messages);
  if (
    AFFIRMATIVE_ONLY_PATTERN.test(trimmed) &&
    assistantText &&
    COMMITMENT_OFFER_PATTERN.test(assistantText)
  ) {
    return {
      action: "start",
      reason: "Affirmative response after tour or signup offer.",
      allowedActions,
    };
  }

  return null;
}

const CLASSIFIER_PROMPT = `You decide whether a gym chatbot should start, continue, or reset lead capture.

Lead capture collects four fields in order: full name, phone number, email address, then fitness goals or membership preference. It runs only after the customer is clearly ready to join, sign up, book a tour, or request a callback.

Return JSON with:
- action: none, start, or reset
- reason: one short sentence explaining your decision (for debugging)

Rules for action start (only when current status is idle):
- Customer explicitly opts in: wants to join now, sign up now, start a membership, book a tour, enroll, get a callback / call me back, claim a free day pass or trial, or gives a clear yes/sure AFTER you offered sign-up, a tour, or a callback.
- ALL of these count as explicit opt-in: "sign me up", "I want to join", "let's do it", "call me back", "get me signed up", "I want the Plus membership, how do I sign up?", "I'll take a free day pass", "start my trial".
- Soft interest is NOT enough: "I'm interested in Plus", "thinking about joining", "which membership should I get?", comparing tiers should be action none — keep helping them explore.
- Informational questions (hours, prices, classes) are always action none.

Rules for action reset (only when lead capture is already active):
- Customer sends a greeting, OR explicitly bails ("nevermind", "actually nevermind", "forget it", "stop", "skip", "I don't want to", "cancel"), OR changes topic so completely the prior capture no longer makes sense.
- Do NOT reset when they are clearly answering the requested field (name, phone, or goals).
- Do NOT reset when they ask which membership to choose or ask for a membership recommendation while you are collecting goals — that is still on-topic.
- Do NOT reset when they ask an FAQ-style question mid-capture (e.g. "what are your hours?", "how much is membership?"). Use action none — answer the FAQ, stay in capture, re-prompt for the current field on the next turn.

Rules for action none:
- Normal conversation, FAQ, or providing the field currently being collected.
- When idle and the customer is still exploring or asking questions.
- When collecting goals and the customer asks which membership they should get — answer the question, stay in capture.
- When mid-capture and the customer asks an FAQ — answer the FAQ, stay in capture.
- When the customer answers "yes" / "sure" / "ok" but you NEVER offered a tour, signup, callback, or day pass — do not treat it as opt-in.

Be conservative about start — consult first, capture only on explicit opt-in.`;

function formatConversation(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  limit = 12,
): string {
  return messages
    .slice(-limit)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}

function getAllowedActions(
  currentStatus: CaptureLeadStatus,
  captureActive: boolean,
): string {
  if (captureActive) {
    return "none or reset";
  }

  if (currentStatus === "complete") {
    return "none only";
  }

  return "none or start";
}

export async function classifyLeadCaptureAction(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  currentStatus: CaptureLeadStatus,
): Promise<LeadClassifierResult> {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  const captureActive =
    currentStatus === "collecting_name" ||
    currentStatus === "collecting_phone" ||
    currentStatus === "collecting_email" ||
    currentStatus === "collecting_goals";
  const allowedActions = getAllowedActions(currentStatus, captureActive);

  if (!latestUserMessage) {
    return {
      action: "none",
      reason: "No user message in conversation.",
      allowedActions,
    };
  }

  const deterministic = deterministicClassification(
    messages,
    latestUserMessage.content,
    currentStatus,
    captureActive,
    allowedActions,
  );
  if (deterministic) {
    return deterministic;
  }

  try {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CLASSIFIER_PROMPT },
        {
          role: "user",
          content: `Current lead capture status: ${currentStatus}
Allowed actions: ${allowedActions}

Conversation:
${formatConversation(messages)}

Latest user message:
${latestUserMessage.content}`,
        },
      ],
    });

    const raw =
      response.choices[0]?.message?.content ??
      JSON.stringify({
        action: "none",
        reason: "Classifier returned empty response.",
      });
    const parsed = classifierSchema.parse(JSON.parse(raw));

    if (currentStatus === "complete") {
      return {
        action: "none",
        reason: "Lead capture already complete.",
        allowedActions,
      };
    }

    if (parsed.action === "start" && captureActive) {
      return {
        action: "none",
        reason: `Ignored start during active capture. Classifier said: ${parsed.reason}`,
        allowedActions,
      };
    }

    if (parsed.action === "reset" && !captureActive) {
      return {
        action: "none",
        reason: `Ignored reset while idle. Classifier said: ${parsed.reason}`,
        allowedActions,
      };
    }

    if (
      parsed.action === "start" &&
      currentStatus === "idle" &&
      isSoftLeadInterest(latestUserMessage.content)
    ) {
      return {
        action: "none",
        reason: `Soft interest only — guide without capture. Classifier said: ${parsed.reason}`,
        allowedActions,
      };
    }

    return {
      action: parsed.action,
      reason: parsed.reason,
      allowedActions,
    };
  } catch (error) {
    console.error("Lead classifier failed, defaulting to none:", error);
    return {
      action: "none",
      reason:
        error instanceof Error
          ? `Classifier error: ${error.message}`
          : "Classifier error.",
      allowedActions,
    };
  }
}
