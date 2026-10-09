import { eq } from "drizzle-orm";
import { ownerDb } from "@/lib/db/client";
import { gyms } from "@/lib/db/schema";
import { hasGymConfigOnDisk } from "@/lib/gym/config";

/**
 * Tenant registry gate.
 *
 * The chatbot is embed-only: it must be invisible to random browsers and only
 * functional for gymIds that are actually registered tenants. A registered gym
 * is one that either:
 *   - has a config folder committed on disk (data/gyms/{id}/), or
 *   - has a row in the `gyms` table (DB-onboarded tenants).
 *
 * Use {@link isRegisteredGym} at every public entry point that accepts a gymId
 * (/api/chat, /widget, /api/gym/:id/config, /api/leads) to reject made-up or
 * guessed ids before any OpenAI spend or data write.
 */

// gymId format guard: lowercase/uppercase alnum with internal hyphens.
// Matches our onboarding slugs (e.g. "iron-valley", "acme-hvac").
const GYM_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/i;

const TTL_MS = 60_000;
const cache = new Map<string, { ok: boolean; at: number }>();

/** Dev-only tenant ids that must not be callable in production embeds/API. */
const DEV_ONLY_GYM_IDS = new Set(["demo-gym"]);

function isDevOnlyGymBlockedInProduction(gymId: string): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DEMO_GYM !== "true" &&
    DEV_ONLY_GYM_IDS.has(gymId)
  );
}

/** Cheap synchronous format check — never touches the DB. */
export function isValidGymIdFormat(
  gymId: string | null | undefined,
): gymId is string {
  return typeof gymId === "string" && GYM_ID_RE.test(gymId);
}

/**
 * Returns true when gymId is a real, registered tenant. Disk-backed tenants
 * resolve synchronously; DB-onboarded tenants are looked up in the `gyms`
 * table and cached for a minute to keep the hot chat path fast.
 *
 * Fails closed: invalid format or a DB lookup error returns false.
 */
export async function isRegisteredGym(
  gymId: string | null | undefined,
): Promise<boolean> {
  if (!isValidGymIdFormat(gymId)) {
    return false;
  }

  if (isDevOnlyGymBlockedInProduction(gymId)) {
    return false;
  }

  // File-based tenants (committed config) are always registered.
  if (hasGymConfigOnDisk(gymId)) {
    return true;
  }

  const cached = cache.get(gymId);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.ok;
  }

  let ok = false;
  try {
    // ownerDb: a registered-gym existence check is inherently cross-tenant
    // (we're verifying the id is valid before any GUC is set). app_user under
    // FORCE RLS would see zero rows here, so use the owner connection. This is
    // an existence gate only — it returns no tenant data.
    const rows = await ownerDb
      .select({ id: gyms.id })
      .from(gyms)
      .where(eq(gyms.id, gymId))
      .limit(1);
    ok = rows.length > 0;
  } catch (error) {
    console.warn(`[gym-registry] lookup failed for "${gymId}"`, error);
    ok = false;
  }

  cache.set(gymId, { ok, at: Date.now() });
  return ok;
}

/** Test/escape hatch: drop the in-process registry cache. */
export function clearGymRegistryCache(gymId?: string): void {
  if (gymId) {
    cache.delete(gymId);
  } else {
    cache.clear();
  }
}
