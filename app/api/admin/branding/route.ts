import { z } from "zod";
import { getDashboardAccess } from "@/lib/admin/authz";
import { buildTenantBrandingSettings } from "@/lib/gym/branding";
import { isRegisteredGym } from "@/lib/gym/registry";
import {
  loadTenantConfig,
  saveAgencyBranding,
  agencyBrandingUpdateSchema,
} from "@/lib/gym/tenant-config";

/**
 * Read editable widget branding for a tenant. Stored in gyms.config (Postgres).
 * Agency admin only — business owners manage leads, not widget setup.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gymId = searchParams.get("gymId");
  if (!gymId) {
    return Response.json({ error: "gymId is required" }, { status: 400 });
  }

  const access = await getDashboardAccess(gymId);
  if (!access || access.scope !== "global") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await isRegisteredGym(gymId))) {
    return Response.json({ error: "Gym not found" }, { status: 404 });
  }

  try {
    const config = await loadTenantConfig(gymId);
    return Response.json(buildTenantBrandingSettings(gymId, config), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[admin branding GET]", error);
    return Response.json({ error: "Gym not found" }, { status: 404 });
  }
}

/**
 * Update widget branding for a tenant. Persists to Postgres (and mirrors to
 * disk when data/gyms/{id}/ exists). Agency admin only.
 */
export async function PUT(request: Request) {
  const access = await getDashboardAccess();
  if (!access || access.scope !== "global") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = agencyBrandingUpdateSchema.parse(await request.json());

    if (!(await isRegisteredGym(body.gymId))) {
      return Response.json({ error: "Gym not found" }, { status: 404 });
    }

    const config = await saveAgencyBranding(body);
    return Response.json({
      ok: true,
      settings: buildTenantBrandingSettings(body.gymId, config),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid branding payload" }, { status: 400 });
    }
    console.error("[admin branding PUT]", error);
    return Response.json({ error: "Failed to save branding" }, { status: 500 });
  }
}
