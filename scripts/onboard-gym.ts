import "dotenv/config";
import fs from "fs";
import path from "path";
import { getOnboardBrandingGreeting, getOnboardCategories, getOnboardChatConfig, type OnboardVertical } from "../lib/gym/onboard-templates";

interface CliArgs {
  gymId: string;
  name: string;
  websiteUrl?: string;
  ownerPhone?: string;
  publicPhone?: string;
  contactEmail?: string;
  address?: string;
  vertical: OnboardVertical;
  force: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: Partial<CliArgs> = { force: false, vertical: "local-business" };

  const positional: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--name") {
      result.name = args[++i];
    } else if (arg === "--website") {
      result.websiteUrl = args[++i];
    } else if (arg === "--owner-phone") {
      result.ownerPhone = args[++i];
    } else if (arg === "--public-phone") {
      result.publicPhone = args[++i];
    } else if (arg === "--email") {
      result.contactEmail = args[++i];
    } else if (arg === "--address") {
      result.address = args[++i];
    } else if (arg === "--vertical") {
      const vertical = args[++i] as OnboardVertical;
      if (vertical !== "gym" && vertical !== "local-business") {
        throw new Error('--vertical must be "gym" or "local-business"');
      }
      result.vertical = vertical;
    } else if (arg === "--force") {
      result.force = true;
    } else if (!arg.startsWith("--")) {
      positional.push(arg);
    }
  }

  if (!result.gymId && positional.length > 0) {
    result.gymId = positional[0];
  }
  if (!result.name && positional.length > 1) {
    result.name = positional.slice(1).join(" ");
  }

  if (!result.gymId) {
    throw new Error(
      'Usage: npm run onboard -- <gymId> --name "Business Name" [--vertical gym|local-business] [--website URL --owner-phone +1... --public-phone "(xxx) ..." --email ... --address "..."]',
    );
  }
  if (!/^[a-z0-9-]+$/.test(result.gymId)) {
    throw new Error(
      `gymId "${result.gymId}" must be lowercase letters, digits, and dashes only (e.g. iron-boxing).`,
    );
  }
  if (!result.name) {
    result.name = result.gymId.replace(/-/g, " ").replace(/\b\w/g, (c) =>
      c.toUpperCase(),
    );
  }

  return result as CliArgs;
}

function templateConfig(args: CliArgs & { vertical: OnboardVertical }) {
  const vertical = args.vertical ?? "local-business";
  const chat = getOnboardChatConfig(vertical, args.name);

  return {
    name: args.name,
    tagline: "",
    accentColor: "#2563eb",
    contactEmail: args.contactEmail ?? undefined,
    ownerEmail: args.contactEmail ?? undefined,
    publicPhone: args.publicPhone ?? undefined,
    ownerPhone: args.ownerPhone ?? undefined,
    address: args.address ?? "",
    tone:
      vertical === "gym"
        ? "friendly, helpful, and professional"
        : "direct, confident, and helpful — like a trusted front desk rep",
    websiteUrl: args.websiteUrl ?? undefined,
    categories: getOnboardCategories(vertical),
    chat,
    branding: {
      accentColor: "#2563eb",
      greeting: getOnboardBrandingGreeting(vertical, args.name),
      ctaCopy: {
        tour: vertical === "gym" ? "Want to book a free tour?" : "Book an appointment",
        signup: vertical === "gym" ? "Ready to sign up?" : "Get started",
      },
    },
    twilio: {
      enabled: false,
      ownerPhone: args.ownerPhone ?? "",
      fromNumber: "",
      staffPhones: [],
    },
    followup: {
      enabled: false,
      dayOffsets: [1, 3, 7],
    },
  };
}

function templateFaq(args: CliArgs) {
  return [
    {
      id: "placeholder-hours",
      category: "hours",
      content: `Replace this chunk with ${args.name}'s real staffed hours after running \`npm run ingest -- --gym ${args.gymId} --url ${args.websiteUrl ?? "https://yourgymsite.com"}\`.`,
    },
    {
      id: "placeholder-contact",
      category: "contact",
      content: `Call ${args.publicPhone ?? "the gym"} or email ${args.contactEmail ?? "the front desk"} for immediate help.`,
    },
  ];
}

function writeFileSafe(filePath: string, contents: string, force: boolean) {
  if (fs.existsSync(filePath) && !force) {
    throw new Error(`File already exists: ${filePath} (use --force to overwrite)`);
  }
  fs.writeFileSync(filePath, contents);
}

function main() {
  const args = parseArgs();
  const vertical = args.vertical ?? "local-business";
  const root = path.join(process.cwd(), "data", "gyms", args.gymId);

  if (fs.existsSync(root) && !args.force) {
    throw new Error(
      `Gym folder already exists: ${root}. Use --force to overwrite scaffolding.`,
    );
  }

  fs.mkdirSync(root, { recursive: true });

  writeFileSafe(
    path.join(root, "config.json"),
    JSON.stringify(templateConfig({ ...args, vertical }), null, 2) + "\n",
    args.force,
  );

  writeFileSafe(
    path.join(root, "faq.json"),
    JSON.stringify(templateFaq(args), null, 2) + "\n",
    args.force,
  );

  console.log(`\n✓ Onboarded "${args.name}" as gym id "${args.gymId}"`);
  console.log(`  - data/gyms/${args.gymId}/config.json`);
  console.log(`  - data/gyms/${args.gymId}/faq.json (placeholder chunks)`);
  console.log("\nNext steps:");
  console.log(
    `  1. Edit data/gyms/${args.gymId}/config.json — set tone, branding, twilio (if any).`,
  );
  console.log(
    `  2. Run ingestion: npm run ingest -- --gym ${args.gymId} --url ${args.websiteUrl ?? "https://yourgymsite.com"} [--pdf ./brochure.pdf --schedule ./classes.csv]`,
  );
  console.log(
    `  3. Review proposed chunks in data/gyms/${args.gymId}/faq.json (or visit /admin/internal/ingest).`,
  );
  console.log(`  4. Seed embeddings: npm run seed -- ${args.gymId}`);
  console.log(
    `  5. Customize widget branding (greeting, quick buttons) in /admin/dashboard`,
  );
  console.log(
    `  6. Hand off embed snippet from /admin/dashboard (or test locally via embed.js)`,
  );

  void (async () => {
    try {
      const { getGymConfig } = await import("../lib/gym/config");
      const { upsertGymConfig } = await import("../lib/gym/db-config");
      const config = getGymConfig(args.gymId);
      await upsertGymConfig(args.gymId, config);
      console.log("\n✓ Synced tenant config to database (gyms table)");
    } catch (error) {
      console.warn(
        "\n⚠ Database sync skipped (set DATABASE_URL to register tenant in Postgres):",
        error instanceof Error ? error.message : error,
      );
    }
  })();
}

try {
  main();
} catch (error) {
  console.error(
    "\n✗ Onboarding failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}
