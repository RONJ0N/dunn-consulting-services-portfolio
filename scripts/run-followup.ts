import "dotenv/config";
import { runFollowupForAllGyms } from "../lib/followup/index";

async function main() {
  const results = await runFollowupForAllGyms();
  for (const result of results) {
    console.log(
      `[${result.gymId}] attempted=${result.attempted} sent=${result.sent} skipped=${result.skipped} errors=${result.errors}`,
    );
    for (const detail of result.details) {
      console.log(
        `  - ${detail.leadId} d${detail.dayOffset} ${detail.status}${detail.error ? ` (${detail.error})` : ""}`,
      );
    }
  }
}

main().catch((error) => {
  console.error("[followup script] failed", error);
  process.exit(1);
});
