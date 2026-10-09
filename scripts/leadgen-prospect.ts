import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  prospectFromGooglePlaces,
  upsertProspects,
  type ProspectInput,
} from "../lib/leadgen";

/**
 * Build a prospect list.
 *
 * From Google Places (requires GOOGLE_PLACES_API_KEY):
 *   npm run leadgen:prospect -- --niche "HVAC contractor" --metro "Austin, TX" --limit 50 --min-reviews 10
 *
 * From a CSV (headers: businessName,phone,website,address — extras ignored):
 *   npm run leadgen:prospect -- --niche hvac --metro "Austin, TX" --csv ./list.csv
 */

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseCsv(filePath: string, niche: string, metro: string): ProspectInput[] {
  const raw = fs.readFileSync(path.resolve(filePath), "utf-8");
  const [headerLine, ...lines] = raw.split(/\r?\n/).filter(Boolean);
  const headers = headerLine.split(",").map((header) => header.trim());
  const col = (name: string) => headers.indexOf(name);

  return lines.map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    return {
      niche,
      metro,
      businessName: cells[col("businessName")] ?? "",
      phone: cells[col("phone")] || undefined,
      website: cells[col("website")] || undefined,
      address: cells[col("address")] || undefined,
      source: "csv",
    };
  });
}

async function main() {
  const niche = argValue("--niche");
  const metro = argValue("--metro");
  const csv = argValue("--csv");
  const limit = Number(argValue("--limit") ?? 50);
  const minReviews = Number(argValue("--min-reviews") ?? 10);

  if (!niche || !metro) {
    console.error(
      'Usage: npm run leadgen:prospect -- --niche "HVAC contractor" --metro "Austin, TX" [--limit 50] [--min-reviews 10] [--csv ./list.csv]',
    );
    process.exit(1);
  }

  const inputs = csv
    ? parseCsv(csv, niche, metro)
    : await prospectFromGooglePlaces({ niche, metro, limit, minReviews });

  console.log(`Found ${inputs.length} candidates for "${niche}" in ${metro}.`);

  const { inserted, skipped } = await upsertProspects(inputs);
  console.log(`✓ Inserted ${inserted} new prospects (${skipped} duplicates skipped).`);
  console.log("\nNext: run the evidence audit —");
  console.log("  npm run leadgen:list            # see the call sheet");
  console.log('  npm run leadgen:audit -- --phone 5125550142 --outcome rang_out --notes "5:40pm"');
}

main().catch((error) => {
  console.error("✗ Prospecting failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
