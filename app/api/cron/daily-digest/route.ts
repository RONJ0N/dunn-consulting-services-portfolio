import { authorizeCronRequest } from "@/lib/cron/auth";
import { runDailyDigestForAllGyms } from "@/lib/followup/daily-digest";

/** Hourly cron — sends yesterday's leads at each tenant's configured local hour. */
export async function GET(request: Request) {
  if (!authorizeCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await runDailyDigestForAllGyms();
  return Response.json({ ok: true, results });
}

export { GET as POST };
