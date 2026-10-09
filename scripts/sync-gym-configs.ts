import "dotenv/config";
import { syncAllGymsToDb } from "../lib/gym/db-config";

async function main() {
  const overwrite = process.argv.includes("--overwrite");
  if (overwrite) {
    console.warn(
      "⚠ --overwrite will replace gyms.config in Postgres with data/gyms/*/config.json",
    );
  }
  await syncAllGymsToDb({ overwrite });
  console.log("\n✓ Gym config sync finished.");
}

main().catch((error) => {
  console.error("[sync-gym-configs] failed", error);
  process.exit(1);
});
