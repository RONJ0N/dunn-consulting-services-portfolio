import type { GymConfig } from "./config";
import { isValidTimeZone } from "@/lib/timezone/local";

export const DEFAULT_TIMEZONE = "America/New_York";
export const DEFAULT_DAILY_DIGEST_HOUR = 9;

export const COMMON_TIMEZONES = [
  { value: "America/New_York", label: "Eastern (America/New_York)" },
  { value: "America/Chicago", label: "Central (America/Chicago)" },
  { value: "America/Denver", label: "Mountain (America/Denver)" },
  { value: "America/Los_Angeles", label: "Pacific (America/Los_Angeles)" },
  { value: "America/Phoenix", label: "Arizona (America/Phoenix)" },
  { value: "America/Anchorage", label: "Alaska (America/Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Pacific/Honolulu)" },
] as const;

export type ResolvedDailyDigestSettings = {
  enabled: boolean;
  timezone: string;
  hour: number;
  lastDigestForDate: string | null;
};

export type TenantNotificationSettings = {
  gymId: string;
  dailyDigestEnabled: boolean;
  timezone: string;
  dailyDigestHour: number;
};

export function resolveDailyDigestSettings(
  config: GymConfig,
): ResolvedDailyDigestSettings {
  const notifications = config.notifications;
  const timezone = notifications?.timezone ?? DEFAULT_TIMEZONE;
  return {
    enabled: notifications?.dailyDigestEnabled ?? true,
    timezone: isValidTimeZone(timezone) ? timezone : DEFAULT_TIMEZONE,
    hour: notifications?.dailyDigestHour ?? DEFAULT_DAILY_DIGEST_HOUR,
    lastDigestForDate: notifications?.lastDailyDigestLocalDate ?? null,
  };
}

export function buildTenantNotificationSettings(
  gymId: string,
  config: GymConfig,
): TenantNotificationSettings {
  const resolved = resolveDailyDigestSettings(config);
  return {
    gymId,
    dailyDigestEnabled: resolved.enabled,
    timezone: resolved.timezone,
    dailyDigestHour: resolved.hour,
  };
}
