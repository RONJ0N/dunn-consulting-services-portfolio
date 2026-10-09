import { getGymConfig } from "@/lib/gym/config";
import { normalizeE164 } from "@/lib/phone";

/** Phones allowed to reply with CONTACTED / TOUR / SIGNED / LOST for a gym. */
export function getStaffPhonesForGym(gymId: string): string[] {
  const phones = new Set<string>();

  try {
    const config = getGymConfig(gymId);
    for (const phone of config.twilio?.staffPhones ?? []) {
      if (phone) {
        phones.add(normalizeE164(phone));
      }
    }
    if (config.twilio?.ownerPhone) {
      phones.add(normalizeE164(config.twilio.ownerPhone));
    }
    if (config.ownerPhone) {
      phones.add(normalizeE164(config.ownerPhone));
    }
  } catch (error) {
    console.warn("[staff phones] could not load gym config", error);
  }

  for (const phone of (process.env.STAFF_PHONES ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    phones.add(normalizeE164(phone));
  }

  if (process.env.OWNER_PHONE) {
    phones.add(normalizeE164(process.env.OWNER_PHONE));
  }

  return Array.from(phones);
}

/** @deprecated prefer {@link getStaffPhonesForGym} */
export function getStaffPhones(): string[] {
  const raw = process.env.STAFF_PHONES ?? process.env.OWNER_PHONE ?? "";
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((phone) => normalizeE164(phone));
}
