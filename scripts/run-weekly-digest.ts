import "dotenv/config";
import { runWeeklyDigestForAllGyms } from "../lib/followup/digest";

async function main() {
  const results = await runWeeklyDigestForAllGyms();
  for (const result of results) {
    console.log(
      `[${result.gymId}] leads=${result.leadCount} sent=${result.sent}${result.error ? ` error=${result.error}` : ""}`,
    );
  }
}

main().catch((error) => {
  console.error("[weekly digest] failed", error);
  process.exit(1);
});
