/**
 * Normalize a US phone number to E.164 (+1XXXXXXXXXX).
 * Handles: 2025550147, +2025550147, (202) 555-0147, +1 202 555 0147
 */
export function normalizeE164(phone: string, countryCode = "1"): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+${countryCode}${digits}`;
  }

  if (digits.length === 11 && digits.startsWith(countryCode)) {
    return `+${digits}`;
  }

  if (digits.length > 11) {
    return `+${digits}`;
  }

  return `+${countryCode}${digits}`;
}
