import fs from "fs";
import path from "path";
import { z } from "zod";

const categorySchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, "Category id must be snake_case lowercase."),
  name: z.string().min(1),
  description: z.string().optional(),
  injectOnIntents: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
});

const brandingSchema = z
  .object({
    accentColor: z.string().optional(),
    logoUrl: z.string().url().optional(),
    greeting: z.string().optional(),
    /** Short prompts shown as chips above the input (max 6). */
    quickStarts: z.array(z.string().min(1).max(80)).max(6).optional(),
    ctaCopy: z
      .object({
        tour: z.string().optional(),
        signup: z.string().optional(),
      })
      .optional(),
  })
  .partial()
  .default({});

const twilioSchema = z
  .object({
    enabled: z.boolean().default(false),
    ownerPhone: z.string().optional(),
    fromNumber: z.string().optional(),
    staffPhones: z.array(z.string()).default([]),
    /** Real business line calls are forwarded to before text-back triggers. */
    forwardTo: z.string().optional(),
  })
  .partial()
  .default({});

const missedCallSchema = z
  .object({
    enabled: z.boolean().default(false),
    /**
     * Text sent to a missed caller. Supports {{name}} and {{bookingUrl}}
     * placeholders. A sensible default is used when omitted.
     */
    messageTemplate: z.string().optional(),
  })
  .partial()
  .default({});

const followupSchema = z
  .object({
    enabled: z.boolean().default(false),
    dayOffsets: z.array(z.number().int().positive()).default([1, 3, 7]),
    fromNumber: z.string().optional(),
  })
  .partial()
  .default({});

const notificationsSchema = z
  .object({
    /** Email yesterday's leads each morning in the tenant's timezone. */
    dailyDigestEnabled: z.boolean().default(true),
    /** IANA timezone, e.g. America/New_York */
    timezone: z.string().min(1).max(64).default("America/New_York"),
    /** Local hour (0–23) to send the daily digest. Default 9 AM. */
    dailyDigestHour: z.number().int().min(0).max(23).default(9),
    /** Internal — last YYYY-MM-DD digest sent for (prevents duplicate sends). */
    lastDailyDigestLocalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .partial()
  .default({});

const chatSchema = z
  .object({
    /** Replaces the default "AI front desk assistant for {name}..." role line. */
    roleOverride: z.string().max(600).optional(),
    /** Replaces the default numbered job list in the system prompt. */
    jobSummary: z.string().max(2000).optional(),
    /** Extra rules appended to the system prompt (no-pricing policy, focus areas, CTAs). */
    instructions: z.string().max(4000).optional(),
    leadCapture: z
      .object({
        /** When false, flow is name → phone → goals (3 steps). Default true for gym demos. */
        collectEmail: z.boolean().default(true),
        goalsPrompt: z.string().max(600).optional(),
        /** Widget step label for the final capture field (e.g. "Fitness goals" vs "What you need help with"). */
        goalsFieldLabel: z.string().max(120).optional(),
        goalsValidationHint: z.string().max(400).optional(),
        affirmativeGoalsHint: z.string().max(400).optional(),
        completeFollowUp: z.string().max(300).optional(),
      })
      .partial()
      .default({}),
  })
  .partial()
  .default({});

export const configSchema = z.object({
  name: z.string().min(1),
  tagline: z.string().default(""),
  accentColor: z.string().optional(),
  contactEmail: z.string().email().optional(),
  ownerEmail: z.string().email().optional(),
  ownerPhone: z.string().optional(),
  publicPhone: z.string().optional(),
  address: z.string().default(""),
  tone: z.string().default("friendly, helpful, and professional"),
  websiteUrl: z.string().url().optional(),
  /** Calendly / Google appointment link used by the widget and text-back SMS. */
  bookingUrl: z.string().url().optional(),
  /**
   * When false, the widget hides the booking CTA. The URL is still stored for
   * SMS templates and admin editing. Defaults to on when bookingUrl is set.
   */
  bookingEnabled: z.boolean().optional(),
  /**
   * Hostnames (no protocol, no trailing slash) from which the widget embed is
   * allowed to load. E.g. ["dunnconsulting.org", "www.dunnconsulting.org"].
   * When set, requests whose Referer does not match are blocked at the /widget
   * page level. When empty/absent, all origins are allowed (backwards-compat).
   */
  allowedOrigins: z.array(z.string().min(1).max(253)).default([]),
  categories: z.array(categorySchema).default([]),
  branding: brandingSchema,
  chat: chatSchema,
  twilio: twilioSchema,
  missedCall: missedCallSchema,
  followup: followupSchema,
  notifications: notificationsSchema,
});

export type GymCategory = z.infer<typeof categorySchema>;
export type GymBranding = z.infer<typeof brandingSchema>;
export type GymTwilioConfig = z.infer<typeof twilioSchema>;
export type GymMissedCallConfig = z.infer<typeof missedCallSchema>;
export type GymFollowupConfig = z.infer<typeof followupSchema>;
export type GymNotificationsConfig = z.infer<typeof notificationsSchema>;
export type GymConfig = z.infer<typeof configSchema>;

export interface FaqChunk {
  id: string;
  category: string;
  content: string;
}

export interface EmbeddingRecord {
  id: string;
  category: string;
  content: string;
  embedding: number[];
}

const gymsRoot = path.join(process.cwd(), "data", "gyms");

const configCache = new Map<string, GymConfig>();

/**
 * Default categories used when a gym's config.json does not declare any.
 * These match the demo-gym FAQ and keep backwards compatibility with the
 * original Iron Valley fixtures while new gyms ship with explicit categories.
 */
const DEFAULT_CATEGORIES: GymCategory[] = [
  {
    id: "membership",
    name: "Memberships and pricing",
    description: "Membership tiers, prices, freezes, cancellations, discounts.",
    injectOnIntents: ["overview", "membership"],
    keywords: [
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
      "student",
    ],
    examples: ["How much is membership?", "Which plan should I get?"],
  },
  {
    id: "classes",
    name: "Group classes and schedule",
    description: "Class types, days, times, drop-in pricing.",
    injectOnIntents: ["overview", "classes"],
    keywords: [
      "class",
      "classes",
      "yoga",
      "spin",
      "hiit",
      "strength",
      "barbell",
      "schedule",
    ],
    examples: ["What classes do you offer?", "When is spin?"],
  },
  {
    id: "personal_training",
    name: "Personal training",
    description: "PT rates, packages, availability, specialties.",
    injectOnIntents: ["overview", "personal_training"],
    keywords: ["personal training", "trainer", "pt", "coaching", "coach"],
    examples: ["How much is a trainer?", "Do you have personal trainers?"],
  },
  {
    id: "hours",
    name: "Hours and access",
    description: "Staffed hours, holidays, 24-hour access.",
    injectOnIntents: ["hours"],
    keywords: ["hours", "open", "close", "staffed", "holiday"],
    examples: ["What are your hours?", "Are you open Sunday?"],
  },
  {
    id: "equipment",
    name: "Equipment and amenities",
    description: "Cardio, weights, sauna, showers, smoothie bar.",
    injectOnIntents: ["overview", "equipment"],
    keywords: ["equipment", "cardio", "weights", "sauna", "shower"],
    examples: ["What equipment do you have?"],
  },
  {
    id: "location",
    name: "Location and parking",
    description: "Address, parking, neighborhood, transit.",
    injectOnIntents: ["location"],
    keywords: ["address", "parking", "location", "where"],
    examples: ["Where are you located?", "Is parking free?"],
  },
  {
    id: "sales",
    name: "Day passes, trials, tours",
    description: "Free day pass, trial week, tour booking, promotions.",
    injectOnIntents: ["overview", "sales"],
    keywords: ["trial", "day pass", "tour", "free", "promotion"],
    examples: ["Do you offer a free trial?"],
  },
  {
    id: "policies",
    name: "Policies",
    description: "Guest, age, cleanliness, waivers.",
    injectOnIntents: ["policies"],
    keywords: ["policy", "guest", "age", "waiver", "rules"],
    examples: ["Can I bring a guest?", "What's the age requirement?"],
  },
  {
    id: "contact",
    name: "Contact",
    description: "Phone, email, social, human handoff.",
    injectOnIntents: ["contact"],
    keywords: ["phone", "email", "contact", "call", "social"],
    examples: ["How do I reach a human?"],
  },
];

function withDefaults(config: GymConfig): GymConfig {
  if (config.categories.length === 0) {
    return { ...config, categories: DEFAULT_CATEGORIES };
  }
  return config;
}

export function getGymConfig(gymId: string): GymConfig {
  const cached = configCache.get(gymId);
  if (cached) {
    return cached;
  }

  const configPath = path.join(gymsRoot, gymId, "config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`No config.json found for gym "${gymId}"`);
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = configSchema.parse(JSON.parse(raw));
  const finalConfig = withDefaults(parsed);
  configCache.set(gymId, finalConfig);
  return finalConfig;
}

/**
 * Validates a raw config object (e.g. loaded from the gyms DB table) and
 * primes the in-memory cache so subsequent sync getGymConfig() calls work
 * for tenants that have no folder on disk (DB-onboarded clients).
 */
export function primeGymConfig(gymId: string, raw: unknown): GymConfig {
  const parsed = configSchema.parse(raw);
  const finalConfig = withDefaults(parsed);
  configCache.set(gymId, finalConfig);
  return finalConfig;
}

export function hasGymConfigOnDisk(gymId: string): boolean {
  return fs.existsSync(path.join(gymsRoot, gymId, "config.json"));
}

export function clearGymConfigCache(gymId?: string): void {
  if (gymId) {
    configCache.delete(gymId);
  } else {
    configCache.clear();
  }
}

export function getGymFaqChunks(gymId: string): FaqChunk[] {
  const faqPath = path.join(gymsRoot, gymId, "faq.json");
  const raw = fs.readFileSync(faqPath, "utf-8");
  return JSON.parse(raw) as FaqChunk[];
}

export function getGymEmbeddings(gymId: string): EmbeddingRecord[] {
  const embeddingsPath = path.join(gymsRoot, gymId, "embeddings.json");
  if (!fs.existsSync(embeddingsPath)) {
    throw new Error(
      `Embeddings not found for gym "${gymId}". Run: npm run seed -- ${gymId}`,
    );
  }

  const raw = fs.readFileSync(embeddingsPath, "utf-8");
  return JSON.parse(raw) as EmbeddingRecord[];
}

export function listGymIds(): string[] {
  if (!fs.existsSync(gymsRoot)) {
    return [];
  }
  return fs
    .readdirSync(gymsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export function getDefaultCategories(): GymCategory[] {
  return DEFAULT_CATEGORIES.map((category) => ({ ...category }));
}
