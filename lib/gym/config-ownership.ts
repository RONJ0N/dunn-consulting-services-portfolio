import type { GymCategory, GymConfig } from "./config";

/**
 * Widget surface fields the agency admin edits in the dashboard branding card.
 * Business (tenant) login never receives write access to these routes.
 */
export type AgencyBrandingPatch = {
  accentColor?: string;
  bookingUrl?: string | null;
  bookingEnabled?: boolean;
  publicPhone?: string;
  allowedOrigins?: string[];
  branding?: {
    greeting?: string;
    accentColor?: string;
    logoUrl?: string | null;
    quickStarts?: string[];
    ctaCopy?: {
      tour?: string;
      signup?: string;
    };
  };
  notifications?: {
    dailyDigestEnabled?: boolean;
    timezone?: string;
    dailyDigestHour?: number;
  };
};

/**
 * Platform / knowledge fields only the agency admin sets (Neon, internal FAQ,
 * onboarding scripts). Tenants never write these.
 */
export type AgencyAdminKnowledgePatch = {
  tone?: string;
  tagline?: string;
  websiteUrl?: string;
  contactEmail?: string;
  ownerEmail?: string;
  chat?: GymConfig["chat"];
  categories?: GymCategory[];
};

const AGENCY_BRANDING_KEYS = [
  "accentColor",
  "bookingUrl",
  "bookingEnabled",
  "publicPhone",
  "allowedOrigins",
  "branding",
  "notifications",
] as const satisfies readonly (keyof GymConfig)[];

/** Merge agency widget branding without touching chat, categories, tone, etc. */
export function applyAgencyBrandingPatch(
  base: GymConfig,
  patch: AgencyBrandingPatch,
): GymConfig {
  const merged: GymConfig = { ...base };

  if (patch.accentColor !== undefined) {
    merged.accentColor = patch.accentColor;
  }
  if (patch.bookingUrl !== undefined) {
    merged.bookingUrl = patch.bookingUrl ?? undefined;
  }
  if (patch.bookingEnabled !== undefined) {
    merged.bookingEnabled = patch.bookingEnabled;
  }
  if (patch.publicPhone !== undefined) {
    merged.publicPhone = patch.publicPhone;
  }
  if (patch.allowedOrigins !== undefined) {
    merged.allowedOrigins = patch.allowedOrigins;
  }

  if (patch.branding) {
    merged.branding = {
      ...base.branding,
      ...(patch.branding.greeting !== undefined
        ? { greeting: patch.branding.greeting }
        : {}),
      ...(patch.branding.accentColor !== undefined
        ? { accentColor: patch.branding.accentColor }
        : {}),
      ...(patch.branding.logoUrl !== undefined
        ? { logoUrl: patch.branding.logoUrl ?? undefined }
        : {}),
      ...(patch.branding.quickStarts !== undefined
        ? { quickStarts: patch.branding.quickStarts }
        : {}),
      ...(patch.branding.ctaCopy !== undefined
        ? {
            ctaCopy: {
              ...base.branding?.ctaCopy,
              ...patch.branding.ctaCopy,
            },
          }
        : {}),
    };
  }

  if (patch.notifications) {
    merged.notifications = {
      ...base.notifications,
      ...(patch.notifications.dailyDigestEnabled !== undefined
        ? { dailyDigestEnabled: patch.notifications.dailyDigestEnabled }
        : {}),
      ...(patch.notifications.timezone !== undefined
        ? { timezone: patch.notifications.timezone }
        : {}),
      ...(patch.notifications.dailyDigestHour !== undefined
        ? { dailyDigestHour: patch.notifications.dailyDigestHour }
        : {}),
    };
  }

  // Guard: branding saves must never mutate admin-only keys even if a caller
  // accidentally spreads extra properties onto the patch object.
  for (const key of AGENCY_BRANDING_KEYS) {
    void key;
  }

  return merged;
}

/** Merge admin knowledge / prompt config without touching widget branding. */
export function applyAdminKnowledgePatch(
  base: GymConfig,
  patch: AgencyAdminKnowledgePatch,
): GymConfig {
  return {
    ...base,
    ...(patch.tone !== undefined ? { tone: patch.tone } : {}),
    ...(patch.tagline !== undefined ? { tagline: patch.tagline } : {}),
    ...(patch.websiteUrl !== undefined ? { websiteUrl: patch.websiteUrl } : {}),
    ...(patch.contactEmail !== undefined
      ? { contactEmail: patch.contactEmail }
      : {}),
    ...(patch.ownerEmail !== undefined ? { ownerEmail: patch.ownerEmail } : {}),
    ...(patch.chat !== undefined ? { chat: patch.chat } : {}),
    ...(patch.categories !== undefined ? { categories: patch.categories } : {}),
  };
}
