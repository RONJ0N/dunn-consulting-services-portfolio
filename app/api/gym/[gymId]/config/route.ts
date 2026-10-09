import { buildPublicWidgetConfig } from "@/lib/gym/branding";
import { ensureGymLoaded } from "@/lib/gym/db-config";
import { isRegisteredGym } from "@/lib/gym/registry";
import { loadTenantConfig } from "@/lib/gym/tenant-config";
import { verifyEmbedRequest } from "@/lib/embed/token";

/**
 * Public endpoint used by the embeddable widget to fetch a gym's
 * branding (accent color, greeting, quick-start chips, public phone).
 * Does NOT expose owner email, Twilio credentials, or category keywords.
 */
export async function GET(
  request: Request,
  { params }: { params: { gymId: string } },
) {
  try {
    if (!(await isRegisteredGym(params.gymId))) {
      return Response.json({ error: "Gym not found" }, { status: 404 });
    }
    if (!verifyEmbedRequest(request, params.gymId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    await ensureGymLoaded(params.gymId);
    const config = await loadTenantConfig(params.gymId);

    return Response.json(buildPublicWidgetConfig(params.gymId, config), {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (error) {
    console.error("[gym config]", error);
    return Response.json({ error: "Gym not found" }, { status: 404 });
  }
}
