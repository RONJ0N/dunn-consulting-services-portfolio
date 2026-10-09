import "dotenv/config";
import { createGymAdminUser } from "../lib/admin/gym-auth";

async function main() {
  const args = process.argv.slice(2);
  const gymId = args[0];
  const email = args[1];
  const password = args[2];
  const role = (args[3] ?? "owner") as "owner" | "manager" | "staff";

  if (!gymId || !email || !password) {
    console.error(
      "Usage: npm run gym-admin:create -- <gymId> <email> <password> [role=owner]",
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  try {
    const user = await createGymAdminUser({ gymId, email, password, role });
    console.log(`\n✓ Created ${role} for ${gymId}: ${user.email}`);
    console.log(`  User id: ${user.id}`);
  } catch (error) {
    console.error("\n✗", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
