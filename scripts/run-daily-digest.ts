import "dotenv/config";
import { runDailyDigestForAllGyms } from "../lib/followup/daily-digest";

async function main() {
  const results = await runDailyDigestForAllGyms();
  for (const result of results) {
    if (result.sent) {
      console.log(
        `[daily digest] ${result.gymId}: sent ${result.leadCount} leads for ${result.digestForDate}`,
      );
    } else if (result.skipped) {
      console.log(
        `[daily digest] ${result.gymId}: skipped${result.error ? ` (${result.error})` : ""}`,
      );
    } else if (result.error) {
      console.error(`[daily digest] ${result.gymId}: ${result.error}`);
    }
  }
}

main().catch((error) => {
  console.error("[daily digest] failed", error);
  process.exit(1);
});
