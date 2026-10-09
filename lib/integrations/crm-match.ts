import { getLeadRepository } from "@/lib/db/repository";
import type { Lead } from "@/lib/db/schema";

export interface CrmMatchInput {
  gymId: string;
  phone?: string;
  email?: string;
  name?: string;
}

/**
 * Find an open lead from a CRM webhook payload. Match priority:
 *   1. Exact phone (last 10 digits)
 *   2. Exact name + recent
 *   3. null (caller should log and skip)
 */
export async function findLeadForCrmEvent(input: CrmMatchInput): Promise<Lead | null> {
  const repository = getLeadRepository();
  const leads = await repository.list(input.gymId);

  if (input.phone) {
    const target = input.phone.replace(/\D/g, "").slice(-10);
    const byPhone = leads.find(
      (lead) => lead.phone.replace(/\D/g, "").slice(-10) === target,
    );
    if (byPhone) return byPhone;
  }

  if (input.name) {
    const normalized = input.name.trim().toLowerCase();
    const byName = leads.find(
      (lead) => lead.name.trim().toLowerCase() === normalized,
    );
    if (byName) return byName;
  }

  return null;
}

export async function markCrmSigned(input: CrmMatchInput, source: string) {
  const lead = await findLeadForCrmEvent(input);
  if (!lead) return null;
  if (lead.pipelineStatus === "signed") return lead;

  const repository = getLeadRepository();
  return repository.updatePipelineStatus(lead.id, "signed", {
    source: "sms",
    note: `CRM webhook (${source}): ${input.phone ?? input.email ?? input.name ?? "match"}`,
  });
}
