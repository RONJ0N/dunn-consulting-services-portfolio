import "dotenv/config";
import {
  AUDIT_OUTCOMES,
  findProspectByPhone,
  recordAuditResult,
  updateProspectStatus,
  type AuditOutcome,
} from "../lib/leadgen";

/**
 * Evidence-audit logger. After each test call to a prospect, record the
 * outcome; for missed calls it prints the ready-to-send follow-up email.
 *
 *   npm run leadgen:audit -- --phone 5125550142 --outcome rang_out --notes "Tue 5:40pm"
 *   npm run leadgen:audit -- --phone 5125550142 --status emailed
 */

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function evidenceEmail(business: string, calledAt: string, outcome: string): string {
  const what =
    outcome === "voicemail"
      ? "it went to voicemail and I never got a text back"
      : "it rang out — no answer, no text back";

  return [
    `Subject: Called ${business} ${calledAt} — here's what happened`,
    "",
    `Hi — I called ${business} ${calledAt} and ${what}.`,
    "",
    "Roughly a third of calls to businesses like yours go unanswered, and each missed emergency call is a $300–800 job that usually books with whoever answers next.",
    "",
    "I build the system that texts every missed caller within 60 seconds with a booking link. Want me to run it on your line free for two weeks? You'll get a plain-English report of every recovered lead — no commitment.",
    "",
    "Redt Dunn",
    "Dunn Consulting — hello@dunnconsulting.org",
  ].join("\n");
}

async function main() {
  const phone = argValue("--phone");
  const outcome = argValue("--outcome") as AuditOutcome | undefined;
  const notes = argValue("--notes");
  const status = argValue("--status");

  if (!phone) {
    console.error(
      "Usage: npm run leadgen:audit -- --phone <digits> (--outcome answered|voicemail|rang_out|text_back_received [--notes ...] | --status emailed|audit_booked|pilot|client|lost)",
    );
    process.exit(1);
  }

  const prospect = await findProspectByPhone(phone);
  if (!prospect) {
    console.error(`✗ No prospect found with phone ${phone}. Run leadgen:prospect first.`);
    process.exit(1);
  }

  if (outcome) {
    if (!AUDIT_OUTCOMES.includes(outcome)) {
      console.error(`✗ Invalid outcome. One of: ${AUDIT_OUTCOMES.join(", ")}`);
      process.exit(1);
    }
    await recordAuditResult({ prospectId: prospect.id, outcome, notes });
    console.log(`✓ ${prospect.businessName}: audit recorded (${outcome}).`);

    if (outcome === "rang_out" || outcome === "voicemail") {
      console.log("\n--- Send this today ---\n");
      console.log(evidenceEmail(prospect.businessName, notes ?? "today", outcome));
      console.log("\nThen log it: npm run leadgen:audit -- --phone", phone, "--status emailed");
    }
    return;
  }

  if (status) {
    await updateProspectStatus(prospect.id, status as never);
    console.log(`✓ ${prospect.businessName}: status -> ${status}.`);
    return;
  }

  console.log(JSON.stringify(prospect, null, 2));
}

main().catch((error) => {
  console.error("✗ Audit logging failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
