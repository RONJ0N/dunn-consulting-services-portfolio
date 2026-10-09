import { z } from "zod";
import { getDashboardAccess } from "@/lib/admin/authz";
import { buildTenantNotificationSettings } from "@/lib/gym/notifications";
import { isRegisteredGym } from "@/lib/gym/registry";
import {
  loadTenantConfig,
  saveAgencyNotifications,
  agencyNotificationsUpdateSchema,
} from "@/lib/gym/tenant-config";

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
    return Response.json(buildTenantNotificationSettings(gymId, config), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[admin notifications GET]", error);
    return Response.json({ error: "Gym not found" }, { status: 404 });
  }
}

export async function PUT(request: Request) {
  const access = await getDashboardAccess();
  if (!access || access.scope !== "global") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = agencyNotificationsUpdateSchema.parse(await request.json());

    if (!(await isRegisteredGym(body.gymId))) {
      return Response.json({ error: "Gym not found" }, { status: 404 });
    }

    const config = await saveAgencyNotifications(body);
    return Response.json({
      ok: true,
      settings: buildTenantNotificationSettings(body.gymId, config),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid notifications payload" }, { status: 400 });
    }
    console.error("[admin notifications PUT]", error);
    return Response.json({ error: "Failed to save notifications" }, { status: 500 });
  }
}
