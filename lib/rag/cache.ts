const embeddingCache = new Map<string, number[]>();
const queryEmbeddingCache = new Map<string, number[]>();

export function getCachedQueryEmbedding(key: string): number[] | undefined {
  return queryEmbeddingCache.get(key);
}

export function setCachedQueryEmbedding(key: string, embedding: number[]): void {
  if (queryEmbeddingCache.size > 200) {
    const firstKey = queryEmbeddingCache.keys().next().value;
    if (firstKey) {
      queryEmbeddingCache.delete(firstKey);
    }
  }
  queryEmbeddingCache.set(key, embedding);
}

export function getGymEmbeddingsFromCache(gymId: string): number[][] | undefined {
  return embeddingCache.get(gymId) as unknown as number[][] | undefined;
}

export function setGymEmbeddingsCache(
  gymId: string,
  records: Array<{ embedding: number[] }>,
): void {
  embeddingCache.set(
    gymId,
    records.map((record) => record.embedding) as unknown as number[],
  );
}

// Store full records in a separate map
const gymRecordsCache = new Map<
  string,
  Array<{ id: string; category: string; content: string; embedding: number[] }>
>();

export function getCachedGymRecords(
  gymId: string,
): Array<{ id: string; category: string; content: string; embedding: number[] }> | undefined {
  return gymRecordsCache.get(gymId);
}

export function setCachedGymRecords(
  gymId: string,
  records: Array<{ id: string; category: string; content: string; embedding: number[] }>,
): void {
  gymRecordsCache.set(gymId, records);
}

/**
 * Drop cached RAG records for a tenant (or all tenants). Call after the admin
 * edits FAQ content so the next chat turn reflects the new knowledge without a
 * redeploy or process restart.
 */
export function clearCachedGymRecords(gymId?: string): void {
  if (gymId) {
    gymRecordsCache.delete(gymId);
    embeddingCache.delete(gymId);
  } else {
    gymRecordsCache.clear();
    embeddingCache.clear();
  }
}
