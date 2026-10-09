import { z } from "zod";
import { getDashboardAccess } from "@/lib/admin/authz";
import {
  getChatMessagesForLead,
  getLeadRepository,
  getLeadStatusHistory,
} from "@/lib/db/repository";
import {
  isPipelineStatus,
  PIPELINE_STATUS_LABELS,
} from "@/lib/lead/pipeline";

const patchSchema = z.object({
  pipelineStatus: z.string(),
  note: z.string().max(500).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const access = await getDashboardAccess();
  if (!access) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { pipelineStatus, note } = patchSchema.parse(body);

    if (!isPipelineStatus(pipelineStatus)) {
      return Response.json({ error: "Invalid pipeline status" }, { status: 400 });
    }

    const repository = getLeadRepository();

    // Tenant sessions may only touch their own gym's leads.
    // Pass gymId to getById so the DB-level filter rejects cross-tenant IDs.
    if (access.scope === "gym") {
      const existing = await repository.getById(params.id, access.gymId);
      if (!existing) {
        return Response.json({ error: "Lead not found" }, { status: 404 });
      }
    }

    const lead = await repository.updatePipelineStatus(
      params.id,
      pipelineStatus,
      {
        source: "admin",
        note: note ?? `Updated in dashboard to ${PIPELINE_STATUS_LABELS[pipelineStatus]}`,
      },
    );

    if (!lead) {
      return Response.json({ error: "Lead not found" }, { status: 404 });
    }

    return Response.json({ lead });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: error.flatten() }, { status: 400 });
    }

    console.error(error);
    return Response.json({ error: "Failed to update lead" }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const access = await getDashboardAccess();
  if (!access) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repository = getLeadRepository();
  // Use gymId filter on getById for gym-scoped sessions (DB-level enforcement).
  const gymIdFilter = access.scope === "gym" ? access.gymId : undefined;
  const lead = await repository.getById(params.id, gymIdFilter);

  if (!lead || (access.scope === "gym" && lead.gymId !== access.gymId)) {
    return Response.json({ error: "Lead not found" }, { status: 404 });
  }

  // Always pass lead.gymId so history and message queries are tenant-scoped.
  const [history, messages] = await Promise.all([
    getLeadStatusHistory(params.id, lead.gymId),
    getChatMessagesForLead(lead),
  ]);

  return Response.json({ lead, history, messages });
}
