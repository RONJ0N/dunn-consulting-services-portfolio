import fs from "fs/promises";
import path from "path";
import { isAdminAuthenticated } from "@/lib/admin/session";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const gymId = searchParams.get("gymId");
  if (!gymId) {
    return Response.json({ error: "Missing gymId" }, { status: 400 });
  }
  const filePath = path.join(
    process.cwd(),
    "data",
    "gyms",
    gymId,
    "ingest-diff.json",
  );
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return Response.json(JSON.parse(raw));
  } catch {
    return Response.json(null);
  }
}
