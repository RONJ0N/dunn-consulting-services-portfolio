import type { GymConfig } from "./config";

/** Default quick-reply chips when a tenant has not configured their own. */
export const DEFAULT_QUICK_STARTS = [
  "What are your hours?",
  "Membership prices",
  "Class schedule",
  "I'd like to book a tour",
];

export type PublicWidgetBranding = {
  accentColor: string;
  logoUrl: string | null;
  greeting: string;
  quickStarts: string[];
  ctaCopy: { tour: string; signup: string };
};

export type PublicWidgetConfig = {
  gymId: string;
  name: string;
  tagline: string;
  address: string;
  publicPhone: string;
  bookingUrl: string | null;
  branding: PublicWidgetBranding;
};

/** Whether the widget should show the booking CTA (distinct from SMS / stored URL). */
export function isBookingCtaEnabled(config: GymConfig): boolean {
  if (config.bookingEnabled !== undefined) {
    return config.bookingEnabled;
  }
  return Boolean(config.bookingUrl);
}

/** Shape exposed to the embed widget (no owner secrets). */
export function buildPublicWidgetConfig(
  gymId: string,
  config: GymConfig,
): PublicWidgetConfig {
  return {
    gymId,
    name: config.name,
    tagline: config.tagline,
    address: config.address,
    publicPhone: config.publicPhone ?? "",
    bookingUrl: isBookingCtaEnabled(config) ? (config.bookingUrl ?? null) : null,
    branding: {
      accentColor:
        config.branding?.accentColor ?? config.accentColor ?? "#E63946",
      logoUrl: config.branding?.logoUrl ?? null,
      greeting:
        config.branding?.greeting ??
        `Hi! I'm the ${config.name} assistant. How can I help you today?`,
      quickStarts: config.branding?.quickStarts ?? DEFAULT_QUICK_STARTS,
      ctaCopy: {
        tour:
          config.branding?.ctaCopy?.tour ?? "Want to book a free consultation?",
        signup:
          config.branding?.ctaCopy?.signup ?? "Ready to get started?",
      },
    },
  };
}

/** Editable branding fields stored per tenant (gyms.config JSON). */
export type TenantBrandingSettings = {
  gymId: string;
  name: string;
  accentColor: string;
  bookingUrl: string | null;
  bookingEnabled: boolean;
  publicPhone: string;
  /** Hostnames allowed to embed this widget. Empty = allow all. */
  allowedOrigins: string[];
  branding: PublicWidgetBranding;
};

export function buildTenantBrandingSettings(
  gymId: string,
  config: GymConfig,
): TenantBrandingSettings {
  const publicConfig = buildPublicWidgetConfig(gymId, config);
  return {
    gymId,
    name: config.name,
    accentColor: publicConfig.branding.accentColor,
    bookingUrl: config.bookingUrl ?? null,
    bookingEnabled: isBookingCtaEnabled(config),
    publicPhone: publicConfig.publicPhone,
    allowedOrigins: config.allowedOrigins ?? [],
    branding: publicConfig.branding,
  };
}
