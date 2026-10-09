import { z } from "zod";
import { CHAT_MODEL, getOpenAIClient } from "../openai";

export interface IntentCategoryDescriptor {
  id: string;
  name?: string;
  description?: string;
  examples?: string[];
}

export interface IntentClassifierInput {
  gymId: string;
  latestUserMessage: string;
  lastAssistantMessage?: string | null;
  availableCategories: IntentCategoryDescriptor[];
}

export interface IntentClassifierResult {
  /** Subset of available category ids whose chunks should be force-injected for this turn. */
  categories: string[];
  /** When true, the caller should bypass top-K retrieval and dump every FAQ chunk to the prompt. */
  fullDump: boolean;
  /** When true, the caller should respond with the hard deferral template instead of generating freely. */
  deferToFrontDesk: boolean;
  /** Short debug rationale. */
  reason: string;
  /** "deterministic" if we short-circuited the LLM call, otherwise "llm". */
  source: "deterministic" | "llm" | "fallback";
}

const responseSchema = z.object({
  categories: z.array(z.string()).default([]),
  fullDump: z.boolean().default(false),
  deferToFrontDesk: z.boolean().default(false),
  reason: z.string().default(""),
});

interface CacheEntry {
  result: IntentClassifierResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 500;
const cache = new Map<string, CacheEntry>();

function normalizeQuery(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 300);
}

function cacheKey(input: IntentClassifierInput): string {
  return `${input.gymId}::${normalizeQuery(input.latestUserMessage)}::${normalizeQuery(
    input.lastAssistantMessage ?? "",
  )}::${input.availableCategories
    .map((category) => category.id)
    .sort()
    .join(",")}`;
}

function readCache(key: string): IntentClassifierResult | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function writeCache(key: string, result: IntentClassifierResult): void {
  if (cache.size >= CACHE_MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      cache.delete(firstKey);
    }
  }
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Allow stacked greetings and an optional trailing "there" / "everyone".
// Catches "hi", "hey hi hello there", "good morning everyone", etc.
const GREETING_TOKEN = "(hi|hiya|hello|hey|yo|sup|howdy|good\\s+(morning|afternoon|evening))";
const GREETING_RE = new RegExp(
  `^\\s*${GREETING_TOKEN}(\\s+${GREETING_TOKEN})*(\\s+(there|everyone|all|y'?all))?[!.?\\s]*$`,
  "i",
);
const THANKS_RE = /^\s*(thanks|thank you|thx|appreciate it)[!.?\s]*$/i;

const OVERVIEW_FULL_DUMP_RE =
  /\b(full|overall|complete|everything|all of)\b.*\b(rundown|run\s*down|breakdown|overview|info|tour|story|details|services|offer|gym|place|business)\b|\b(tell me everything|tell me about (the |your )?gym|what (do|does) (you|the gym) offer|what services|give me (the |a |some )?(rundown|run\s*down|overview|info|details|tour)|info (about|on) (the |your )?gym|learn (more )?about (the |your )?gym|gym overview|gym summary)\b/i;

function deterministicShortCircuit(
  input: IntentClassifierInput,
): IntentClassifierResult | null {
  const trimmed = input.latestUserMessage.trim();

  if (!trimmed) {
    return {
      categories: [],
      fullDump: false,
      deferToFrontDesk: false,
      reason: "Empty message — no injection.",
      source: "deterministic",
    };
  }

  if (GREETING_RE.test(trimmed) || THANKS_RE.test(trimmed)) {
    return {
      categories: [],
      fullDump: false,
      deferToFrontDesk: false,
      reason: "Greeting or thanks — no injection.",
      source: "deterministic",
    };
  }

  if (OVERVIEW_FULL_DUMP_RE.test(trimmed)) {
    return {
      categories: input.availableCategories.map((category) => category.id),
      fullDump: true,
      deferToFrontDesk: false,
      reason: "Broad overview request — dump all FAQ chunks.",
      source: "deterministic",
    };
  }

  return null;
}

function buildPrompt(input: IntentClassifierInput): string {
  const categoryLines = input.availableCategories
    .map((category) => {
      const parts = [`- "${category.id}"`];
      if (category.name) {
        parts.push(`(${category.name})`);
      }
      if (category.description) {
        parts.push(`— ${category.description}`);
      }
      if (category.examples && category.examples.length > 0) {
        parts.push(`Examples: ${category.examples.slice(0, 3).join("; ")}`);
      }
      return parts.join(" ");
    })
    .join("\n");

  return `You are a query intent router for a gym AI chatbot. Your job is to decide which FAQ categories should be injected into context for the gym chatbot to answer the customer's latest question.

Available FAQ categories for this gym:
${categoryLines}

Rules:
- Return ONLY categories that directly answer the latest user message. Be precise, not greedy.
- If the user asks a broad question about the gym ("what do you offer", "tell me about the gym", "rundown", "overview"), set fullDump=true so all FAQ is injected.
- If the user asks a question the FAQ categories above clearly cannot answer (e.g., unrelated topic, personal/legal/medical advice, off-topic), set deferToFrontDesk=true and categories=[].
- Resolve pronouns ("they", "them", "those") using the last assistant message. If the assistant just discussed classes, "what time are they?" means classes.
- Multiple categories are fine if the question genuinely spans them (e.g., "do trainers cost extra or are they included in membership?" → personal_training AND membership).
- Never invent category ids that are not in the list above.

Return strict JSON: { "categories": string[], "fullDump": boolean, "deferToFrontDesk": boolean, "reason": "one short sentence" }`;
}

function buildUserMessage(input: IntentClassifierInput): string {
  const assistantContext = input.lastAssistantMessage
    ? `\nLast assistant message (for pronoun/follow-up resolution):\n"""${input.lastAssistantMessage.slice(0, 600)}"""`
    : "";

  return `Latest user message:
"""${input.latestUserMessage.slice(0, 800)}"""${assistantContext}

Return the JSON now.`;
}

/**
 * Lightweight LLM-driven router that maps a user question to a set of FAQ categories.
 * Runs in parallel with the embedding call, falls back gracefully on failure.
 */
export async function classifyQueryIntent(
  input: IntentClassifierInput,
): Promise<IntentClassifierResult> {
  if (input.availableCategories.length === 0) {
    return {
      categories: [],
      fullDump: false,
      deferToFrontDesk: false,
      reason: "No categories declared for gym.",
      source: "fallback",
    };
  }

  const deterministic = deterministicShortCircuit(input);
  if (deterministic) {
    return deterministic;
  }

  const key = cacheKey(input);
  const cached = readCache(key);
  if (cached) {
    return cached;
  }

  try {
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildPrompt(input) },
        { role: "user", content: buildUserMessage(input) },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = responseSchema.parse(JSON.parse(raw));
    const allowedIds = new Set(
      input.availableCategories.map((category) => category.id),
    );
    const filteredCategories = parsed.categories.filter((id) =>
      allowedIds.has(id),
    );

    const result: IntentClassifierResult = {
      categories: parsed.fullDump
        ? Array.from(allowedIds)
        : filteredCategories,
      fullDump: parsed.fullDump,
      deferToFrontDesk: parsed.deferToFrontDesk && filteredCategories.length === 0,
      reason: parsed.reason || "LLM intent classification.",
      source: "llm",
    };

    writeCache(key, result);
    return result;
  } catch (error) {
    return {
      categories: [],
      fullDump: false,
      deferToFrontDesk: false,
      reason:
        error instanceof Error
          ? `Intent classifier failure: ${error.message}`
          : "Intent classifier failure.",
      source: "fallback",
    };
  }
}

export function clearIntentClassifierCache(): void {
  cache.clear();
}
