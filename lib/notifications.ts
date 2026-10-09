/**
 * @deprecated Import from `@/lib/notifications` (index) instead.
 * This shim keeps existing imports working during the migration.
 */
export {
  notifyLeadCaptured,
  notifyOwnerOfLead,
  sendEmail,
  sendSms,
  isEmailGloballyEnabled,
  isTwilioGloballyEnabled,
  isTwilioEnabled,
  resolveTwilioCredentials,
  resolveOwnerEmail,
  getStaffPhonesForGym,
  getStaffPhones,
} from "@/lib/notifications/index";
export type { NotificationResult } from "@/lib/notifications/index";
