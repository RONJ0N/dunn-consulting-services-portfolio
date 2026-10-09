import "dotenv/config";
import { listProspects, type ProspectStatus } from "../lib/leadgen";

/**
 * Print the call sheet / pipeline.
 *
 *   npm run leadgen:list                  # everything
 *   npm run leadgen:list -- prospect      # only un-called prospects
 */
async function main() {
  const status = process.argv[2] as ProspectStatus | undefined;
  const rows = await listProspects(status);

  if (rows.length === 0) {
    console.log("No prospects yet. Run: npm run leadgen:prospect -- --niche ... --metro ...");
    return;
  }

  console.log(
    `${"STATUS".padEnd(13)} ${"BUSINESS".padEnd(34)} ${"PHONE".padEnd(12)} ${"REVIEWS".padEnd(8)} AUDIT`,
  );
  for (const row of rows) {
    console.log(
      `${row.pipelineStatus.padEnd(13)} ${row.businessName.slice(0, 33).padEnd(34)} ${(row.phone ?? "—").padEnd(12)} ${String(row.reviewCount ?? "—").padEnd(8)} ${row.auditOutcome ?? "—"}`,
    );
  }
  console.log(`\n${rows.length} prospect(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
