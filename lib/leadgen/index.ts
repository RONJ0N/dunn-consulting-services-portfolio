import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { prospects, type NewProspect, type Prospect } from "@/lib/db/schema";

/**
 * Lead-gen engine: builds prospect lists for the agency's own outreach and
 * for the sellable "lead gen" service. Prospects live in the same database
 * as everything else (the Supabase-native CRM) and move through:
 * prospect -> called -> emailed -> audit_booked -> pilot -> client | lost.
 */

export const PROSPECT_STATUSES = [
  "prospect",
  "called",
  "emailed",
  "audit_booked",
  "pilot",
  "client",
  "lost",
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const AUDIT_OUTCOMES = [
  "answered",
  "voicemail",
  "rang_out",
  "text_back_received",
] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export interface ProspectInput {
  niche: string;
  metro: string;
  businessName: string;
  phone?: string;
  website?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  source?: string;
}

function normalizePhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : undefined;
}

/** Insert prospects, skipping duplicates (same phone or same name+metro). */
export async function upsertProspects(
  inputs: ProspectInput[],
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  const now = new Date();

  for (const input of inputs) {
    const phone = normalizePhone(input.phone);

    const existing = phone
      ? await db
          .select({ id: prospects.id })
          .from(prospects)
          .where(eq(prospects.phone, phone))
          .limit(1)
      : await db
          .select({ id: prospects.id })
          .from(prospects)
          .where(
            and(
              eq(prospects.businessName, input.businessName),
              eq(prospects.metro, input.metro),
            ),
          )
          .limit(1);

    if (existing[0]) {
      skipped += 1;
      continue;
    }

    const row: NewProspect = {
      id: randomUUID(),
      niche: input.niche,
      metro: input.metro,
      businessName: input.businessName,
      phone: phone ?? null,
      website: input.website ?? null,
      address: input.address ?? null,
      rating: input.rating ?? null,
      reviewCount: input.reviewCount ?? null,
      source: input.source ?? "manual",
      pipelineStatus: "prospect",
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(prospects).values(row);
    inserted += 1;
  }

  return { inserted, skipped };
}

export async function findProspectByPhone(
  phone: string,
): Promise<Prospect | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const rows = await db
    .select()
    .from(prospects)
    .where(eq(prospects.phone, normalized))
    .limit(1);
  return rows[0] ?? null;
}

/** Record an evidence-audit call result and advance the pipeline. */
export async function recordAuditResult(options: {
  prospectId: string;
  outcome: AuditOutcome;
  notes?: string;
}): Promise<void> {
  await db
    .update(prospects)
    .set({
      auditCalledAt: new Date(),
      auditOutcome: options.outcome,
      auditNotes: options.notes ?? null,
      pipelineStatus: "called",
      updatedAt: new Date(),
    })
    .where(eq(prospects.id, options.prospectId));
}

export async function updateProspectStatus(
  prospectId: string,
  status: ProspectStatus,
): Promise<void> {
  await db
    .update(prospects)
    .set({
      pipelineStatus: status,
      updatedAt: new Date(),
      ...(status === "emailed" ? { emailedAt: new Date() } : {}),
    })
    .where(eq(prospects.id, prospectId));
}

export async function listProspects(
  status?: ProspectStatus,
): Promise<Prospect[]> {
  if (status) {
    return db
      .select()
      .from(prospects)
      .where(eq(prospects.pipelineStatus, status))
      .orderBy(sql`updated_at DESC`);
  }
  return db.select().from(prospects).orderBy(sql`updated_at DESC`);
}

/* ----------------------- Google Places prospecting ----------------------- */

interface PlacesResult {
  displayName?: { text?: string };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
}

/**
 * Builds a prospect list from the Google Places Text Search API (New).
 * Requires GOOGLE_PLACES_API_KEY. Filters to established businesses
 * (minReviews) — they have real call volume and a real budget.
 */
export async function prospectFromGooglePlaces(options: {
  niche: string;
  metro: string;
  limit?: number;
  minReviews?: number;
}): Promise<ProspectInput[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY is not set. Create a Google Cloud project, enable Places API (New), and add the key to .env.",
    );
  }

  const limit = options.limit ?? 50;
  const minReviews = options.minReviews ?? 10;
  const collected: ProspectInput[] = [];
  let pageToken: string | undefined;

  while (collected.length < limit) {
    const response: globalThis.Response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.displayName,places.nationalPhoneNumber,places.websiteUri,places.formattedAddress,places.rating,places.userRatingCount,nextPageToken",
        },
        body: JSON.stringify({
          textQuery: `${options.niche} in ${options.metro}`,
          pageSize: Math.min(20, limit - collected.length),
          ...(pageToken ? { pageToken } : {}),
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Places API ${response.status}: ${text.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      places?: PlacesResult[];
      nextPageToken?: string;
    };

    for (const place of data.places ?? []) {
      if ((place.userRatingCount ?? 0) < minReviews) continue;
      if (!place.displayName?.text) continue;
      collected.push({
        niche: options.niche,
        metro: options.metro,
        businessName: place.displayName.text,
        phone: place.nationalPhoneNumber,
        website: place.websiteUri,
        address: place.formattedAddress,
        rating: place.rating,
        reviewCount: place.userRatingCount,
        source: "google-places",
      });
      if (collected.length >= limit) break;
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return collected;
}
