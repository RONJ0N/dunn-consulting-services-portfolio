import { randomUUID } from "crypto";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { ownerDb } from "@/lib/db/client";
import { isPostgres } from "@/lib/db/driver";
import { withTenantContext } from "@/lib/db/tenant-db";
import { faqChunks, gyms, type Gym } from "@/lib/db/schema";
import {
  getGymConfig,
  hasGymConfigOnDisk,
  listGymIds,
  primeGymConfig,
  type EmbeddingRecord,
  type GymConfig,
} from "./config";

/**
 * Mirror of {@link getGymConfig} that reads the gym's config from the `gyms`
 * table first, falling back to the JSON file on disk. Use this in routes
 * that need to support hot-edited gym configs (admin UI / Supabase).
 *
 * Falls through silently to the file system in dev so the demo still works.
 */
export async function getGymConfigFromDb(
  gymId: string,
): Promise<GymConfig> {
  try {
    // Use withTenantContext so app_user (APP_DATABASE_URL) can read the gyms
    // row — the tenant_isolation RLS policy requires app.gym_id to be set.
    const row = await withTenantContext(gymId, (tx) =>
      tx.select().from(gyms).where(eq(gyms.id, gymId)).limit(1),
    );
    const record = row[0];
    if (record) {
      return JSON.parse(record.config) as GymConfig;
    }
  } catch (error) {
    console.warn("[gym] could not read gym config from db", error);
  }
  return getGymConfig(gymId);
}

export async function upsertGymConfig(
  gymId: string,
  config: GymConfig,
): Promise<Gym> {
  // Wrap in withTenantContext so app_user (APP_DATABASE_URL) can write to the
  // gyms table — tenant_isolation RLS policy requires app.gym_id to be set.
  // void randomUUID kept to mirror other tables in case surrogate keys are added.
  void randomUUID;
  return withTenantContext(gymId, async (tx) => {
    const now = new Date();
    const existing = await tx.select().from(gyms).where(eq(gyms.id, gymId)).limit(1);
    if (existing[0]) {
      await tx
        .update(gyms)
        .set({ name: config.name, config: JSON.stringify(config), updatedAt: now })
        .where(eq(gyms.id, gymId));
      return { ...existing[0], name: config.name, config: JSON.stringify(config), updatedAt: now };
    }
    const row: Gym = {
      id: gymId,
      name: config.name,
      config: JSON.stringify(config),
      createdAt: now,
      updatedAt: now,
    };
    await tx.insert(gyms).values(row);
    return row;
  });
}

const loadedFromDb = new Set<string>();
const ensuredRegistryRow = new Set<string>();

/**
 * Guarantees a row exists in the `gyms` registry table for a disk-based tenant.
 *
 * Disk tenants (data/gyms/{id}/) historically lived only on disk, but the
 * gym_id foreign keys reference gyms.id — so every tenant that writes leads /
 * sessions / messages must have a registry row.
 *
 * IMPORTANT: Once a row exists in Postgres, the DB is the source of truth.
 * We never overwrite an existing row with the committed disk config — that
 * would revert admin branding edits on every serverless cold start.
 */
async function ensureGymRegistryRow(gymId: string): Promise<void> {
  if (ensuredRegistryRow.has(gymId) || !hasGymConfigOnDisk(gymId)) {
    return;
  }
  try {
    const existing = await withTenantContext(gymId, (tx) =>
      tx.select().from(gyms).where(eq(gyms.id, gymId)).limit(1),
    );

    if (existing[0]) {
      primeGymConfig(gymId, JSON.parse(existing[0].config) as GymConfig);
    } else {
      const diskConfig = getGymConfig(gymId);
      await upsertGymConfig(gymId, diskConfig);
      primeGymConfig(gymId, diskConfig);
    }

    ensuredRegistryRow.add(gymId);
  } catch (error) {
    console.warn(`[gym] ensureGymRegistryRow(${gymId}) failed`, error);
  }
}

/**
 * Makes a tenant resolvable by the sync getGymConfig() call sites and ensures a
 * `gyms` registry row exists (so gym_id FKs hold).
 *
 * File-based tenants (data/gyms/{id}/) get a registry row bootstrapped from disk
 * when missing; if the row already exists, config is loaded from Postgres into
 * the in-process cache. DB-onboarded tenants (no folder on disk — created via
 * the onboarding flow) get their config pulled from the gyms table once per
 * process and primed into the config cache. Call this at request entry points
 * before any sync getGymConfig() usage or gym-scoped write.
 */
export async function ensureGymLoaded(gymId: string): Promise<void> {
  if (hasGymConfigOnDisk(gymId)) {
    await ensureGymRegistryRow(gymId);
    return;
  }

  if (loadedFromDb.has(gymId)) {
    return;
  }

  try {
    const rows = await withTenantContext(gymId, (tx) =>
      tx.select().from(gyms).where(eq(gyms.id, gymId)).limit(1),
    );
    const record = rows[0];
    if (record) {
      primeGymConfig(gymId, JSON.parse(record.config));
      loadedFromDb.add(gymId);
    }
  } catch (error) {
    console.warn(`[gym] ensureGymLoaded(${gymId}) failed`, error);
  }
}

/**
 * Loads a tenant's RAG embeddings from the faq_chunks table. Used as the
 * fallback when data/gyms/{id}/embeddings.json does not exist on the deploy
 * (DB-onboarded tenants). Embeddings are stored as JSON text on SQLite and
 * pgvector on Postgres — both decode to number[].
 */
export async function getGymEmbeddingsFromDb(
  gymId: string,
): Promise<EmbeddingRecord[]> {
  const rows = await withTenantContext(gymId, (tx) =>
    tx
      .select()
      .from(faqChunks)
      .where(and(eq(faqChunks.gymId, gymId), isNotNull(faqChunks.embedding))),
  );

  return rows.map((row) => ({
    id: row.chunkId,
    category: row.category,
    content: row.content,
    embedding:
      typeof row.embedding === "string"
        ? (JSON.parse(row.embedding) as number[])
        : ((row.embedding ?? []) as number[]),
  }));
}

export interface DbVectorSearchResult {
  id: string;
  category: string;
  content: string;
  /** Cosine similarity in [0, 1] (1 - pgvector cosine distance). */
  similarity: number;
}

/**
 * Top-K semantic search executed in Postgres using the HNSW index on
 * faq_chunks.embedding (`vector_cosine_ops`). This pushes the nearest-neighbor
 * work into the database instead of loading every tenant's embeddings into
 * memory and scoring them in JS — required to scale past tiny demo corpora.
 *
 * Postgres-only: the SQLite dev driver has no vector type, so callers must gate
 * on {@link isPostgres} and fall back to the in-memory cosine path.
 */
export async function searchGymChunksByVector(
  gymId: string,
  queryEmbedding: number[],
  topK = 5,
): Promise<DbVectorSearchResult[]> {
  // pgvector literal form: '[0.1,0.2,...]'. Cast to ::vector so the operator
  // and HNSW index are used. The `<=>` operator returns cosine DISTANCE.
  const literal = `[${queryEmbedding.join(",")}]`;

  const rows = await withTenantContext(gymId, (tx) =>
    tx
      .select({
        id: faqChunks.chunkId,
        category: faqChunks.category,
        content: faqChunks.content,
        distance: sql<number>`${faqChunks.embedding} <=> ${literal}::vector`,
      })
      .from(faqChunks)
      .where(and(eq(faqChunks.gymId, gymId), isNotNull(faqChunks.embedding)))
      .orderBy(sql`${faqChunks.embedding} <=> ${literal}::vector`)
      .limit(topK),
  );

  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    content: row.content,
    similarity: 1 - Number(row.distance),
  }));
}

/**
 * Upserts a tenant's FAQ chunks + embeddings into the faq_chunks table so the
 * deployed app can serve them without a redeploy (replace-all per tenant).
 */
export async function saveEmbeddingsToDb(
  gymId: string,
  records: EmbeddingRecord[],
): Promise<void> {
  const now = new Date();
  await withTenantContext(gymId, async (tx) => {
    await tx.delete(faqChunks).where(eq(faqChunks.gymId, gymId));
    if (records.length === 0) return;

    await tx.insert(faqChunks).values(
      records.map((record) => ({
        id: `${gymId}:${record.id}`,
        gymId,
        chunkId: record.id,
        category: record.category,
        content: record.content,
        embedding: (isPostgres
          ? record.embedding
          : JSON.stringify(record.embedding)) as unknown as string,
        updatedAt: now,
      })),
    );
  });
}

/**
 * Lists every tenant id the app should operate on: the union of file-based
 * tenants (data/gyms/{id}/) and DB-onboarded tenants (rows in the `gyms`
 * table). Cron jobs MUST use this instead of the disk-only {@link listGymIds}
 * or DB-only tenants would silently never get follow-ups / digests.
 */
export async function listAllGymIds(): Promise<string[]> {
  const ids = new Set<string>(listGymIds());
  try {
    const rows = await ownerDb.select({ id: gyms.id }).from(gyms);
    for (const row of rows) {
      ids.add(row.id);
    }
  } catch (error) {
    console.warn("[gym] listAllGymIds: db query failed, using disk only", error);
  }
  return Array.from(ids);
}

export async function syncAllGymsToDb(options?: { overwrite?: boolean }) {
  const overwrite = options?.overwrite ?? false;
  const ids = listGymIds();
  for (const id of ids) {
    try {
      const config = getGymConfig(id);
      if (overwrite) {
        await upsertGymConfig(id, config);
        console.log(`[gym sync] ${id} → db (overwrite)`);
        continue;
      }

      const existing = await withTenantContext(id, (tx) =>
        tx.select({ id: gyms.id }).from(gyms).where(eq(gyms.id, id)).limit(1),
      );
      if (existing[0]) {
        console.log(`[gym sync] ${id} skipped (row already exists)`);
        continue;
      }

      await upsertGymConfig(id, config);
      console.log(`[gym sync] ${id} → db (insert)`);
    } catch (error) {
      console.warn(`[gym sync] skipped ${id}:`, error);
    }
  }
}
