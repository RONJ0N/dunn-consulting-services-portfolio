const BUYING_INTENT_PATTERN =
  /\b(join|sign up|signup|trial|tour|membership|call me back|callback|call back|get started|enroll|register)\b/i;

function hasBuyingIntent(message: string): boolean {
  return BUYING_INTENT_PATTERN.test(message);
}

const QUESTION_START =
  /^\s*(what|how|when|where|why|who|which|can you|can i|do you|does|is|are|will|could|would|tell me|show me|i want to know|membership|class|classes|hours|price|pricing|schedule|book a|cancel|personal training)/i;

// Verbs/imperatives a person would never start their name with.
// Catches things like "give me a rundown", "tell me about", "show me",
// "need help with", "want to know", "let me see"...
const COMMAND_START =
  /^\s*(give|tell|show|need|want|let|please|send|email|text|call|make|recommend|suggest|describe|explain|list|share|provide|help)\b/i;

const INVALID_CHARS = /[?@#/$\\,;:]|https?:|www\./i;

// Zero-width characters and bidi overrides used to smuggle hidden payloads
// or impersonate other names with visually identical strings.
const DISALLOWED_UNICODE = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/;

// Phrases used to bail out of lead capture. Should be classified as a reset,
// NOT stored as a name. Caught a regression class of bugs where "skip" and
// "I don't want to" were being persisted as the lead's name.
const OPT_OUT_PATTERN =
  /^\s*(skip|nevermind|never mind|no thanks?|not interested|i don'?t want( to)?|stop|cancel|exit|quit|leave me alone|forget it|actually nevermind)[!.?\s]*$/i;

export function isOptOut(input: string): boolean {
  return OPT_OUT_PATTERN.test(input.trim());
}

// Prompt-injection-shaped strings that should never reach the model as
// "user goals" because they get re-fed into context on the next turn.
const INSTRUCTION_INJECTION_PATTERN =
  /\b(ignore|disregard|forget)\b.{0,30}\b(instructions?|prompt|rules|system|context)\b|\b(you are now|act as|pretend (you|to be)|print your (system )?prompt|repeat the (prompt|instructions))\b/i;

// URL / domain pattern. Used to keep links out of fields that get SMS'd to
// staff (we don't want phishing links riding our notifications).
const URL_PATTERN =
  /https?:\/\/|www\.|\b[a-z0-9.-]+\.(com|net|org|io|co|xyz|info|biz|app|gym|fit)\b/i;

// Single-word profanity guard. Cheap stopgap to keep abusive single-word
// goals out of the staff SMS. Not exhaustive — moderation would be the
// production-grade solution.
const PROFANITY_ONLY_PATTERN =
  /^\s*(fuck|fucking|shit|bitch|asshole|cunt|dick|piss|wtf|stfu)[!.?\s]*$/i;

const AFFIRMATIVE_ONLY_PATTERN =
  /^\s*(yes|yeah|yep|yup|sure|ok|okay|absolutely|definitely|sounds good|go ahead|please|thanks|thank you)[!.?\s]*$/i;

function looksLikePhone(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

export function isValidName(input: string): boolean {
  // Normalize to NFKC so visually-identical forms collapse to canonical
  // characters before we run any guards.
  const trimmed = input.normalize("NFKC").trim();

  if (trimmed.length < 2 || trimmed.length > 80) {
    return false;
  }

  if (DISALLOWED_UNICODE.test(trimmed)) {
    return false;
  }

  if (INVALID_CHARS.test(trimmed)) {
    return false;
  }

  if (AFFIRMATIVE_ONLY_PATTERN.test(trimmed)) {
    return false;
  }

  if (OPT_OUT_PATTERN.test(trimmed)) {
    return false;
  }

  if (looksLikePhone(trimmed)) {
    return false;
  }

  if (hasBuyingIntent(trimmed)) {
    return false;
  }

  if (QUESTION_START.test(trimmed)) {
    return false;
  }

  if (COMMAND_START.test(trimmed)) {
    return false;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  // A real first+last name is 1-4 words. Anything longer is almost
  // certainly a sentence/pasted question, not a name.
  if (words.length > 4) {
    return false;
  }
  if (words.length === 1 && words[0].replace(/[^a-zA-Z]/g, "").length < 3) {
    return false;
  }

  const letterCount = (trimmed.match(/[a-zA-Z]/g) ?? []).length;
  if (letterCount < 2) {
    return false;
  }

  return true;
}

export function isAffirmativeOnly(input: string): boolean {
  return AFFIRMATIVE_ONLY_PATTERN.test(input.trim());
}

export function isValidGoals(input: string): boolean {
  const trimmed = input.normalize("NFKC").trim();

  if (trimmed.length < 3 || trimmed.length > 300) {
    return false;
  }

  if (DISALLOWED_UNICODE.test(trimmed)) {
    return false;
  }

  if (AFFIRMATIVE_ONLY_PATTERN.test(trimmed)) {
    return false;
  }

  if (OPT_OUT_PATTERN.test(trimmed)) {
    return false;
  }

  if (URL_PATTERN.test(trimmed)) {
    return false;
  }

  if (INSTRUCTION_INJECTION_PATTERN.test(trimmed)) {
    return false;
  }

  if (PROFANITY_ONLY_PATTERN.test(trimmed)) {
    return false;
  }

  if (/^\s*(which|what)\s+membership\b/i.test(trimmed)) {
    return false;
  }

  if (/^\s*(recommend|suggest|help me choose|help me pick)\b/i.test(trimmed)) {
    return false;
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return false;
  }

  if (QUESTION_START.test(trimmed) && trimmed.endsWith("?")) {
    return false;
  }

  if (/^\s*(join|sign up|signup|book a tour|tour|call me back|get started|enroll|register)\s*$/i.test(trimmed)) {
    return false;
  }

  if (looksLikePhone(trimmed)) {
    return false;
  }

  return true;
}

export function isValidEmail(input: string): boolean {
  const trimmed = input.trim();
  // Basic RFC-5321 shape: local@domain.tld, no spaces, no leading/trailing dots.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) && trimmed.length <= 254;
}

export function validationHint(
  field: "name" | "email" | "goals",
): string {
  if (field === "name") {
    return "That doesn't look like a full name. Ask them again for their first and last name only — not a question or request.";
  }

  if (field === "email") {
    return "That doesn't look like a valid email address. Ask them to provide their email so we can follow up (e.g. name@example.com).";
  }

  return "That doesn't look like a fitness goal or membership choice. Ask them again what they're hoping to achieve or which membership tier they want (e.g. Basic).";
}
