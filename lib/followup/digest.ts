import { getGymConfig } from "@/lib/gym/config";
import { ensureGymLoaded, listAllGymIds } from "@/lib/gym/db-config";
import { leadRefFromId } from "@/lib/lead/pipeline";
import { getLeadRepository } from "@/lib/db/repository";
import {
  sendEmail,
  resolveOwnerEmail,
  isEmailGloballyEnabled,
} from "@/lib/notifications/outbound";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface WeeklyDigestResult {
  gymId: string;
  leadCount: number;
  sent: boolean;
  error?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function runWeeklyDigestForGym(
  gymId: string,
): Promise<WeeklyDigestResult> {
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

  const since = new Date(Date.now() - WEEK_MS);
  const repository = getLeadRepository();
  const allLeads = await repository.list(gymId);
  const weekLeads = allLeads.filter(
    (lead) =>
      lead.createdAt >= since &&
      ["new", "contacted"].includes(lead.pipelineStatus),
  );

  if (weekLeads.length === 0) {
    return { gymId, leadCount: 0, sent: false, error: "No open leads to digest" };
  }

  const shown = weekLeads.slice(0, 10);
  const overflow = weekLeads.length - shown.length;

  const subject = `${config.name}: ${weekLeads.length} open lead${weekLeads.length === 1 ? "" : "s"} this week`;

  const textLines = [
    subject,
    "",
    ...shown.map(
      (lead) => `  • ${leadRefFromId(lead.id)}: ${lead.name} — ${lead.goals}`,
    ),
    overflow > 0 ? `  … and ${overflow} more.` : "",
    "",
    "Log in to the admin dashboard to update lead statuses.",
  ].filter((line) => line !== undefined);

  const textBody = textLines.join("\n");

  const htmlBody = `
<h2 style="font-family:sans-serif;color:#333">${escapeHtml(config.name)}: Weekly Lead Digest</h2>
<p style="font-family:sans-serif">${weekLeads.length} open lead${weekLeads.length === 1 ? "" : "s"} in the past 7 days:</p>
<ul style="font-family:sans-serif;line-height:1.7">
${shown
  .map(
    (lead) =>
      `  <li><strong>${escapeHtml(leadRefFromId(lead.id))}</strong>: ${escapeHtml(lead.name)} — ${escapeHtml(lead.goals)}</li>`,
  )
  .join("\n")}
${overflow > 0 ? `  <li>… and ${overflow} more.</li>` : ""}
</ul>
<p style="font-family:sans-serif">Log in to the admin dashboard to update lead statuses.</p>`.trim();

  const send = await sendEmail({
    gymId,
    to: ownerEmail,
    subject,
    text: textBody,
    html: htmlBody,
  });

  return {
    gymId,
    leadCount: weekLeads.length,
    sent: send.sent,
    error: send.error,
  };
}

export async function runWeeklyDigestForAllGyms(): Promise<WeeklyDigestResult[]> {
  const results: WeeklyDigestResult[] = [];
  for (const gymId of await listAllGymIds()) {
    results.push(await runWeeklyDigestForGym(gymId));
  }
  return results;
}
