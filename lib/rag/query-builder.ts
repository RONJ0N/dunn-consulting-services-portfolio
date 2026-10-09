const DAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const CLASS_KEYWORDS = [
  "yoga",
  "spin",
  "hiit",
  "strength",
  "barbell",
  "class",
  "classes",
  "schedule",
  "gentle flow",
  "power yoga",
];

/** FAQ categories used for bulk chunk injection during retrieval. */
export const RAG_INJECT_CATEGORIES = {
  membership: "membership",
  classes: "classes",
  hours: "hours",
  personalTraining: "personal_training",
  equipment: "equipment",
} as const;

const MEMBERSHIP_KEYWORDS = [
  "membership",
  "price",
  "pricing",
  "cost",
  "tier",
  "basic",
  "plus",
  "premium",
  "cancel",
  "freeze",
  "annual",
  "cheapest",
  "student",
];
const PT_KEYWORDS = ["personal training", "trainer", "pt", "coaching"];
const HOURS_KEYWORDS = ["hours", "open", "close", "staffed", "holiday"];
const POLICY_KEYWORDS = ["policy", "guest", "age", "cancel", "freeze", "waiver"];

/**
 * Build the string we embed for semantic search.
 *
 * IMPORTANT: We only use the latest user message here. Concatenating prior
 * turns ("query pollution") was the root cause of R9 in the issue log —
 * a PT question would inherit "classes" / "rundown" keywords from earlier
 * turns and pull the wrong chunks. Pronoun/follow-up resolution is now
 * the intent classifier's job (it sees the last assistant message).
 */
export function buildSearchQuery(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  const latest = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  return latest?.content.trim() ?? "";
}

/** Return the assistant's last reply (for intent-classifier pronoun resolution). */
export function getLastAssistantMessage(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): string | null {
  return (
    [...messages].reverse().find((message) => message.role === "assistant")
      ?.content ?? null
  );
}

export function getLatestUserMessage(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  return (
    [...messages].reverse().find((message) => message.role === "user")?.content ??
    ""
  );
}

export function isBroadMembershipQuery(message: string): boolean {
  const lower = message.toLowerCase();

  if (/\b(which|what)\s+membership\s+(should|would|do|can)\b/.test(lower)) {
    return true;
  }

  if (/\b(recommend|suggest|help me choose|help me pick)\b/.test(lower) && /\bmembership\b/.test(lower)) {
    return true;
  }

  if (!/\b(membership|memberships|tier|tiers|plan|plans|pricing|price)\b/.test(lower)) {
    return false;
  }

  return (
    /\b(other|others|different|options|plans|tiers|all|what do you offer|do you have)\b/.test(
      lower,
    ) ||
    /\bare there\b/.test(lower) ||
    /\bmembership prices?\b/.test(lower) ||
    /\bhow much\b/.test(lower)
  );
}

export function isClassRelatedQuery(message: string): boolean {
  const lower = message.toLowerCase();

  if (CLASS_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return true;
  }

  return /\b(group fitness|fitness class)\b/.test(lower);
}

export function isClassFollowUpQuery(
  latestMessage: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): boolean {
  if (isClassRelatedQuery(latestMessage)) {
    return true;
  }

  const lower = latestMessage.toLowerCase();
  const scheduleFollowUp =
    /\b(what time|when are|hours of|offered at|other classes?|any other|all classes?|more classes?)\b/.test(
      lower,
    );

  if (!scheduleFollowUp) {
    return false;
  }

  const recent = messages
    .slice(-8)
    .map((message) => message.content)
    .join(" ")
    .toLowerCase();

  return (
    CLASS_KEYWORDS.some((keyword) => recent.includes(keyword)) ||
    /\b(yoga|spin|hiit|strength training|group fitness)\b/.test(recent)
  );
}

export function isBroadGymOverviewQuery(message: string): boolean {
  const lower = message.toLowerCase();

  return (
    /\b(full run down|run down|what do you offer|what does the gym offer|what the gym offers|what services|gym offers|tell me about (the gym|everything)|overview|info about the gym|some info|give me info|about the gym|about your gym|learn about)\b/.test(
      lower,
    ) && !/\b(membership|memberships)\s+(only|alone)\b/.test(lower)
  );
}

export function isGeneralHoursQuery(message: string): boolean {
  const lower = message.toLowerCase();

  if (/\b(sunday|holiday|christmas|thanksgiving|new year)\b/.test(lower)) {
    return false;
  }

  // "hours of yoga classes" means class schedule, not front desk hours.
  if (isClassRelatedQuery(message)) {
    return false;
  }

  return HOURS_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export type SearchIntent =
  | "classes"
  | "membership"
  | "personal_training"
  | "hours"
  | "policies"
  | "general";

export function detectSearchIntent(query: string): SearchIntent {
  const lower = query.toLowerCase();

  if (CLASS_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "classes";
  }
  if (PT_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "personal_training";
  }
  if (MEMBERSHIP_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "membership";
  }
  if (HOURS_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "hours";
  }
  if (POLICY_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "policies";
  }

  return "general";
}

export function keywordBoost(
  query: string,
  content: string,
  category: string,
  intent: SearchIntent,
): number {
  const lowerQuery = query.toLowerCase();
  const lowerContent = content.toLowerCase();
  let boost = 0;

  for (const day of DAY_NAMES) {
    if (lowerQuery.includes(day) && lowerContent.includes(day)) {
      boost += 0.08;
    }
  }

  for (const keyword of [
    ...CLASS_KEYWORDS,
    ...MEMBERSHIP_KEYWORDS,
    ...PT_KEYWORDS,
    ...HOURS_KEYWORDS,
  ]) {
    if (lowerQuery.includes(keyword) && lowerContent.includes(keyword)) {
      boost += 0.05;
    }
  }

  if (intent !== "general" && category === intent) {
    boost += 0.12;
  }

  if (intent === "membership" && category === "sales") {
    boost += 0.06;
  }

  return boost;
}

export const MIN_CONFIDENCE_SCORE = 0.72;
