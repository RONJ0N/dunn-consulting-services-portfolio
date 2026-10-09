import { Resend } from "resend";
import { formatPhone } from "@/lib/chat/lead-session";
import { leadRefFromId } from "@/lib/lead/pipeline";
import { getGymConfig, type GymConfig } from "@/lib/gym/config";
import type { Lead } from "@/lib/db/schema";

export interface NotificationResult {
  /** True when the owner notification email was sent successfully. */
  smsSent: boolean;
  /** True when email notifications are not configured (no API key or no owner email). */
  smsDisabled: boolean;
  errors: string[];
}

const DEFAULT_FROM = "Redt Dunn <hello@dunnconsulting.org>";

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export function getFromAddress(): string {
  return process.env.RESEND_FROM ?? DEFAULT_FROM;
}

export function isEmailGloballyEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** @deprecated Use isEmailGloballyEnabled */
export function isTwilioGloballyEnabled(): boolean {
  return isEmailGloballyEnabled();
}

/** @deprecated Use isTwilioGloballyEnabled */
export const isTwilioEnabled = isTwilioGloballyEnabled;

/** Resolve the owner's notification email from gym config or env fallback. */
export function resolveOwnerEmail(config: GymConfig): string {
  return config.ownerEmail ?? config.contactEmail ?? process.env.OWNER_EMAIL ?? "";
}

/**
 * Backward-compat shim for callers that inspect `.enabled` or `.ownerPhone`.
 * All SMS-specific credential fields (accountSid, authToken, fromNumber) are
 * now empty strings — voice infrastructure reads those directly from env.
 *
 * @deprecated Migrate callers to resolveOwnerEmail + isEmailGloballyEnabled.
 */
export function resolveTwilioCredentials(config: GymConfig): {
  ownerPhone: string;
  ownerEmail: string;
  enabled: boolean;
  accountSid: string;
  authToken: string;
  fromNumber: string;
} | null {
  const ownerEmail = resolveOwnerEmail(config);
  const ownerPhone =
    config.twilio?.ownerPhone ?? config.ownerPhone ?? process.env.OWNER_PHONE ?? "";
  if (!ownerEmail && !ownerPhone) return null;
  return {
    accountSid: "",
    authToken: "",
    fromNumber: config.twilio?.fromNumber ?? process.env.TWILIO_PHONE_NUMBER ?? "",
    ownerPhone,
    ownerEmail,
    enabled: isEmailGloballyEnabled(),
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendLeadEmail(lead: Lead, config: GymConfig): Promise<boolean> {
  const resend = getResendClient();
  if (!resend) return false;

  const ownerEmail = resolveOwnerEmail(config);
  if (!ownerEmail) return false;

  const ref = leadRefFromId(lead.id);
  const subject = `New lead for ${config.name}: ${lead.name}`;
  const textBody = [
    `New lead for ${config.name}!`,
    `Name:  ${lead.name}`,
    `Phone: ${formatPhone(lead.phone)}`,
    ...(lead.email ? [`Email: ${lead.email}`] : []),
    `Goal:  ${lead.goals}`,
    `Ref:   ${ref}`,
  ].join("\n");

  const emailRow = lead.email
    ? `  <tr><td style="padding:4px 16px 4px 0;color:#666">Email</td><td><a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a></td></tr>\n`
    : "";

  const htmlBody = `
<h2 style="color:#333;font-family:sans-serif">New lead: ${escapeHtml(lead.name)}</h2>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;line-height:1.6">
  <tr><td style="padding:4px 16px 4px 0;color:#666">Business</td><td>${escapeHtml(config.name)}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666">Name</td><td>${escapeHtml(lead.name)}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666">Phone</td><td>${escapeHtml(formatPhone(lead.phone))}</td></tr>
${emailRow}  <tr><td style="padding:4px 16px 4px 0;color:#666">Goal</td><td>${escapeHtml(lead.goals)}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666">Ref</td><td>${escapeHtml(ref)}</td></tr>
</table>`.trim();

  console.log("[resend] Sending lead email:", { to: ownerEmail, gymId: lead.gymId });

  const { error } = await resend.emails.send({
    from: getFromAddress(),
    to: [ownerEmail],
    subject,
    text: textBody,
    html: htmlBody,
  });

  if (error) {
    console.error("[resend] Lead email failed:", error);
    return false;
  }

  console.log("[resend] Lead email sent:", { to: ownerEmail, gymId: lead.gymId });
  return true;
}

export async function notifyLeadCaptured(lead: Lead): Promise<NotificationResult> {
  console.log("[lead captured]", {
    id: lead.id,
    gymId: lead.gymId,
    name: lead.name,
    phone: lead.phone,
    goals: lead.goals,
  });

  const config = getGymConfig(lead.gymId);
  const errors: string[] = [];
  const ownerEmail = resolveOwnerEmail(config);
  const smsDisabled = !isEmailGloballyEnabled() || !ownerEmail;
  let smsSent = false;

  try {
    if (!isEmailGloballyEnabled()) {
      console.log("[resend] Skipping email notification — RESEND_API_KEY not set");
    } else if (!ownerEmail) {
      console.log("[resend] Skipping email — no owner email configured for gym", lead.gymId);
      errors.push(
        "Email not sent: set ownerEmail or contactEmail in gym config, or set OWNER_EMAIL env var.",
      );
    } else {
      smsSent = await sendLeadEmail(lead, config);
      if (!smsSent) {
        errors.push(
          "Email not sent: verify RESEND_API_KEY and owner email (ownerEmail/contactEmail in config or OWNER_EMAIL env var).",
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    errors.push(`Email failed: ${message}`);
    console.error("[resend error]", error);
  }

  if (errors.length > 0) {
    console.warn("[notification errors]", errors);
  }

  return { smsSent, smsDisabled, errors };
}

export const notifyOwnerOfLead = notifyLeadCaptured;

/**
 * Generic outbound email. Used by digest and missed-call owner notifications.
 * Skips sending if `to` doesn't contain "@" (phone-number recipients are
 * silently skipped since we cannot email an arbitrary phone number).
 */
export async function sendEmail(options: {
  gymId: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!options.to.includes("@")) {
    console.log("[resend] Skipping email — recipient has no email address", {
      gymId: options.gymId,
    });
    return { sent: false, error: "No email address for recipient." };
  }

  const resend = getResendClient();
  if (!resend) {
    return { sent: false, error: "RESEND_API_KEY not set." };
  }

  try {
    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: [options.to],
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    if (error) {
      const msg =
        typeof error === "object" && error !== null && "message" in error
          ? String((error as Record<string, unknown>).message)
          : JSON.stringify(error);
      console.error("[resend outbound error]", error);
      return { sent: false, error: msg };
    }

    console.log("[resend] Outbound email sent:", { gymId: options.gymId });
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("[resend outbound error]", error);
    return { sent: false, error: message };
  }
}

/**
 * @deprecated SMS sending has been removed; the app now sends email via Resend.
 * Callers should migrate to sendEmail() or the notifyLeadCaptured/digest flows.
 */
export async function sendSms(options: {
  gymId: string;
  to: string;
  body: string;
  from?: string;
}): Promise<{ sent: boolean; error?: string }> {
  console.warn("[resend] sendSms() called — SMS removed. Migrate to sendEmail().", {
    gymId: options.gymId,
  });
  return { sent: false, error: "SMS removed; use sendEmail() instead." };
}
