import { getDashboardAccess } from "@/lib/admin/authz";
import {
  getAllGymAnalytics,
  getGymAnalytics,
} from "@/lib/db/repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gymId = searchParams.get("gymId");

  const access = await getDashboardAccess(gymId ?? undefined);
  if (!access) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!gymId && access.scope !== "global") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (gymId) {
    const analytics = await getGymAnalytics(gymId);
    return Response.json({ analytics });
  }

  const analytics = await getAllGymAnalytics();
  return Response.json({ analytics });
}
