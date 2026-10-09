export const PIPELINE_STATUSES = [
  "new",
  "contacted",
  "tour",
  "signed",
  "lost",
] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
  new: "New",
  contacted: "Contacted",
  tour: "Tour",
  signed: "Signed",
  lost: "Lost",
};

const SMS_STATUS_PATTERN =
  /\b(CONTACTED|TOUR|SIGNED|LOST|NEW)\b/i;

export function leadRefFromId(id: string): string {
  return id.replace(/-/g, "").slice(0, 4).toUpperCase();
}

export function parsePipelineStatusFromSms(body: string): PipelineStatus | null {
  const match = body.trim().match(SMS_STATUS_PATTERN);
  if (!match) {
    return null;
  }

  const value = match[1].toLowerCase();
  if (PIPELINE_STATUSES.includes(value as PipelineStatus)) {
    return value as PipelineStatus;
  }

  return null;
}

export function parseLeadRefFromSms(body: string): string | null {
  const match = body.match(/\bREF[:\s]*([A-F0-9]{4})\b/i);
  return match ? match[1].toUpperCase() : null;
}

export function isPipelineStatus(value: string): value is PipelineStatus {
  return PIPELINE_STATUSES.includes(value as PipelineStatus);
}
