import { formatPhone } from "@/lib/chat/lead-session";
import { configSchema, getGymConfig } from "@/lib/gym/config";
import { ensureGymLoaded, listAllGymIds, upsertGymConfig } from "@/lib/gym/db-config";
import {
  resolveDailyDigestSettings,
  type ResolvedDailyDigestSettings,
} from "@/lib/gym/notifications";
import { loadTenantConfig } from "@/lib/gym/tenant-config";
import { leadRefFromId } from "@/lib/lead/pipeline";
import { getLeadRepository } from "@/lib/db/repository";
import {
  sendEmail,
  resolveOwnerEmail,
  isEmailGloballyEnabled,
} from "@/lib/notifications/outbound";
import {
  localDateKey,
  localHour,
  previousDateKey,
} from "@/lib/timezone/local";

export interface DailyDigestResult {
  gymId: string;
  leadCount: number;
  sent: boolean;
  skipped?: boolean;
  digestForDate?: string;
  error?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDigestDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function shouldSendDailyDigestNow(
  now: Date,
  settings: ResolvedDailyDigestSettings,
): { run: boolean; digestForDate: string } {
  const digestForDate = previousDateKey(localDateKey(now, settings.timezone));
  if (!settings.enabled) {
    return { run: false, digestForDate };
  }
  if (localHour(now, settings.timezone) !== settings.hour) {
    return { run: false, digestForDate };
  }
  if (settings.lastDigestForDate === digestForDate) {
    return { run: false, digestForDate };
  }
  return { run: true, digestForDate };
}

async function markDailyDigestSent(
  gymId: string,
  digestForDate: string,
): Promise<void> {
  const config = await loadTenantConfig(gymId);
  const merged = configSchema.parse({
    ...config,
    notifications: {
      ...config.notifications,
      lastDailyDigestLocalDate: digestForDate,
    },
  });
  await upsertGymConfig(gymId, merged);
}

export async function runDailyDigestForGym(
  gymId: string,
  now = new Date(),
  options?: { force?: boolean; digestForDate?: string },
): Promise<DailyDigestResult> {
  let config;
  try {
    await ensureGymLoaded(gymId);
    config = getGymConfig(gymId);
  } catch (error) {
    return {
      gymId,
      leadCount: 0,
      sent: false,
      error: `Missing config: ${error instanceof Error ? error.message : "unknown"}`,
    };
  }

  const settings = resolveDailyDigestSettings(config);
  const schedule = shouldSendDailyDigestNow(now, settings);
  const digestForDate = options?.digestForDate ?? schedule.digestForDate;

  if (!options?.force && !schedule.run) {
    return {
      gymId,
      leadCount: 0,
      sent: false,
      skipped: true,
      digestForDate,
    };
  }

  if (!isEmailGloballyEnabled()) {
    return { gymId, leadCount: 0, sent: false, error: "RESEND_API_KEY not set" };
  }

  const ownerEmail = resolveOwnerEmail(config);
  if (!ownerEmail) {
    return {
      gymId,
      leadCount: 0,
      sent: false,
      error:
        "No owner email — set ownerEmail or contactEmail in gym config, or set OWNER_EMAIL env var.",
    };
  }

  const repository = getLeadRepository();
  const dayLeads = (await repository.list(gymId)).filter(
    (lead) => localDateKey(lead.createdAt, settings.timezone) === digestForDate,
  );

  if (dayLeads.length === 0) {
    if (!options?.force) {
      await markDailyDigestSent(gymId, digestForDate);
    }
    return {
      gymId,
      leadCount: 0,
      sent: false,
      skipped: true,
      digestForDate,
      error: "No leads for previous day",
    };
  }

  const dateLabel = formatDigestDateLabel(digestForDate);
  const subject = `${config.name}: ${dayLeads.length} lead${dayLeads.length === 1 ? "" : "s"} from ${dateLabel}`;

  const textBody = [
    subject,
    "",
    ...dayLeads.map((lead) => {
      const parts = [
        `  • ${leadRefFromId(lead.id)}: ${lead.name}`,
        lead.phone ? ` (${formatPhone(lead.phone)})` : "",
        lead.email ? ` — ${lead.email}` : "",
        lead.goals ? ` — ${lead.goals}` : "",
      ];
      return parts.join("");
    }),
    "",
    "Log in to the admin dashboard to update lead statuses.",
  ].join("\n");

  const htmlBody = `
<h2 style="font-family:sans-serif;color:#333">${escapeHtml(config.name)}: Daily Lead Digest</h2>
<p style="font-family:sans-serif">${dayLeads.length} lead${dayLeads.length === 1 ? "" : "s"} captured on ${escapeHtml(dateLabel)}:</p>
<ul style="font-family:sans-serif;line-height:1.7">
${dayLeads
  .map((lead) => {
    const phone = lead.phone ? ` (${escapeHtml(formatPhone(lead.phone))})` : "";
    const email = lead.email
      ? ` — <a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a>`
      : "";
    const goals = lead.goals ? ` — ${escapeHtml(lead.goals)}` : "";
    return `  <li><strong>${escapeHtml(leadRefFromId(lead.id))}</strong>: ${escapeHtml(lead.name)}${phone}${email}${goals}</li>`;
  })
  .join("\n")}
</ul>
<p style="font-family:sans-serif">Log in to the admin dashboard to update lead statuses.</p>`.trim();

  const send = await sendEmail({
    gymId,
    to: ownerEmail,
    subject,
    text: textBody,
    html: htmlBody,
  });

  if (send.sent && !options?.force) {
    await markDailyDigestSent(gymId, digestForDate);
  }

  return {
    gymId,
    leadCount: dayLeads.length,
    sent: send.sent,
    digestForDate,
    error: send.error,
  };
}

export async function runDailyDigestForAllGyms(
  now = new Date(),
): Promise<DailyDigestResult[]> {
  const results: DailyDigestResult[] = [];
  for (const gymId of await listAllGymIds()) {
    results.push(await runDailyDigestForGym(gymId, now));
  }
  return results;
}
