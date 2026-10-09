import { runWeeklyDigestForAllGyms } from "@/lib/followup/digest";
import { authorizeCronRequest } from "@/lib/cron/auth";

export async function GET(request: Request) {
  if (!authorizeCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await runWeeklyDigestForAllGyms();
  return Response.json({ ok: true, results });
}

export { GET as POST };
