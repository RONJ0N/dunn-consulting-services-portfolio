import { getDashboardAccess } from "@/lib/admin/authz";
import { ownerDb } from "@/lib/db/client";
import { gyms } from "@/lib/db/schema";
import { getGymConfig, listGymIds } from "@/lib/gym/config";

/**
 * Lists tenants for the dashboard selector. Global admins see every tenant
 * (union of DB rows and on-disk folders); a tenant session sees only its own.
 */
export async function GET() {
  const access = await getDashboardAccess();
  if (!access) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = new Map<string, { id: string; name: string }>();

  try {
    // ownerDb: cross-tenant list. app_user is blocked by RLS on the gyms table
    // (it can only see one tenant at a time), so the agency selector must use
    // the owner connection. Safe: this route is agency-admin authenticated.
    const rows = await ownerDb
      .select({ id: gyms.id, name: gyms.name })
      .from(gyms);
    for (const row of rows) {
      tenants.set(row.id, row);
    }
  } catch (error) {
    console.warn("[admin gyms] db list failed", error);
  }

  for (const id of listGymIds()) {
    if (tenants.has(id)) continue;
    try {
      tenants.set(id, { id, name: getGymConfig(id).name });
    } catch {
      tenants.set(id, { id, name: id });
    }
  }

  let list = Array.from(tenants.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  if (access.scope === "gym") {
    list = list.filter((tenant) => tenant.id === access.gymId);
  }

  return Response.json({ gyms: list });
}
