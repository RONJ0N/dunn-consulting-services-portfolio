import { getDashboardAccess } from "@/lib/admin/authz";
import { createEmbedToken } from "@/lib/embed/token";

/**
 * Returns the signed embed token for a gymId so the dashboard snippet can
 * include a `data-token`. Requires an admin session scoped to that gym (or a
 * global agency admin only). Returns token: null when no EMBED_TOKEN_SECRET is set,
 * in which case the snippet is shown without a token.
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

  return Response.json({
    gymId,
    token: createEmbedToken(gymId),
    enforced: process.env.EMBED_ENFORCE_TOKEN === "true",
  });
}
