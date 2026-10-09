import fs from "fs";
import path from "path";
import { z } from "zod";
import {
  configSchema,
  getGymConfig,
  hasGymConfigOnDisk,
  primeGymConfig,
  type GymConfig,
} from "./config";
import {
  applyAdminKnowledgePatch,
  applyAgencyBrandingPatch,
  type AgencyAdminKnowledgePatch,
  type AgencyBrandingPatch,
} from "./config-ownership";
import { isValidTimeZone } from "@/lib/timezone/local";
import {
  getGymConfigFromDb,
  upsertGymConfig,
  ensureGymLoaded,
} from "./db-config";

const gymsRoot = path.join(process.cwd(), "data", "gyms");

/** Agency admin — widget branding card (greeting, colors, embed domains, etc.). */
export const agencyBrandingUpdateSchema = z.object({
  gymId: z.string().min(1).max(64),
  accentColor: z.string().min(4).max(32).optional(),
  bookingUrl: z.string().url().nullable().optional(),
  bookingEnabled: z.boolean().optional(),
  publicPhone: z.string().max(30).optional(),
  allowedOrigins: z.array(z.string().min(1).max(253)).max(20).optional(),
  branding: z
    .object({
      greeting: z.string().min(1).max(600).optional(),
      accentColor: z.string().min(4).max(32).optional(),
      logoUrl: z.string().url().nullable().optional(),
      quickStarts: z.array(z.string().min(1).max(80)).min(1).max(6).optional(),
      ctaCopy: z
        .object({
          tour: z.string().min(1).max(120).optional(),
          signup: z.string().min(1).max(120).optional(),
        })
        .optional(),
    })
    .optional(),
  notifications: z
    .object({
      dailyDigestEnabled: z.boolean().optional(),
      timezone: z
        .string()
        .min(1)
        .max(64)
        .refine(isValidTimeZone, "Invalid IANA timezone")
        .optional(),
      dailyDigestHour: z.number().int().min(0).max(23).optional(),
    })
    .optional(),
});

export const agencyNotificationsUpdateSchema = z.object({
  gymId: z.string().min(1).max(64),
  dailyDigestEnabled: z.boolean().optional(),
  timezone: z
    .string()
    .min(1)
    .max(64)
    .refine(isValidTimeZone, "Invalid IANA timezone")
    .optional(),
  dailyDigestHour: z.number().int().min(0).max(23).optional(),
});

export type AgencyNotificationsUpdate = z.infer<
  typeof agencyNotificationsUpdateSchema
>;

export type AgencyBrandingUpdate = z.infer<typeof agencyBrandingUpdateSchema>;

/** @deprecated Use agencyBrandingUpdateSchema */
export const tenantBrandingUpdateSchema = agencyBrandingUpdateSchema;
export type TenantBrandingUpdate = AgencyBrandingUpdate;

export async function loadTenantConfig(gymId: string): Promise<GymConfig> {
  await ensureGymLoaded(gymId);

  try {
    return await getGymConfigFromDb(gymId);
  } catch {
    return getGymConfig(gymId);
  }
}

async function loadConfigBase(gymId: string): Promise<GymConfig> {
  try {
    return await getGymConfigFromDb(gymId);
  } catch {
    return getGymConfig(gymId);
  }
}

function persistConfig(gymId: string, validated: GymConfig): void {
  primeGymConfig(gymId, validated);

  if (hasGymConfigOnDisk(gymId) && !process.env.VERCEL) {
    const configPath = path.join(gymsRoot, gymId, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(validated, null, 2) + "\n");
  }
}

/**
 * Agency admin saves widget branding only. Preserves chat, categories, tone,
 * and other knowledge fields already in Neon.
 */
export async function saveAgencyBranding(
  update: AgencyBrandingUpdate,
): Promise<GymConfig> {
  const { gymId, ...patch } = update;
  const base = await loadConfigBase(gymId);
  const merged = applyAgencyBrandingPatch(base, patch);
  const validated = configSchema.parse(merged);
  await upsertGymConfig(gymId, validated);
  persistConfig(gymId, validated);
  return validated;
}

/** Agency admin saves notification preferences (daily digest timezone, etc.). */
export async function saveAgencyNotifications(
  update: AgencyNotificationsUpdate,
): Promise<GymConfig> {
  const { gymId, ...fields } = update;
  const patch: AgencyBrandingPatch = {
    notifications: {
      ...(fields.dailyDigestEnabled !== undefined
        ? { dailyDigestEnabled: fields.dailyDigestEnabled }
        : {}),
      ...(fields.timezone !== undefined ? { timezone: fields.timezone } : {}),
      ...(fields.dailyDigestHour !== undefined
        ? { dailyDigestHour: fields.dailyDigestHour }
        : {}),
    },
  };
  return saveAgencyBranding({ gymId, ...patch });
}

/** @deprecated Use saveAgencyBranding */
export const saveTenantBranding = saveAgencyBranding;

/**
 * Agency admin / internal scripts — knowledge base and prompt config only.
 * Does not change greeting, accent, quick-starts, or embed domains.
 */
export async function saveAdminKnowledgeConfig(
  gymId: string,
  patch: AgencyAdminKnowledgePatch,
): Promise<GymConfig> {
  const base = await loadConfigBase(gymId);
  const merged = applyAdminKnowledgePatch(base, patch);
  const validated = configSchema.parse(merged);
  await upsertGymConfig(gymId, validated);
  persistConfig(gymId, validated);
  return validated;
}
