import { embedText } from "./embed";
import {
  getCachedGymRecords,
  getCachedQueryEmbedding,
  setCachedGymRecords,
  setCachedQueryEmbedding,
} from "./cache";
import {
  buildSearchQuery,
  detectSearchIntent,
  getLastAssistantMessage,
  isBroadGymOverviewQuery,
  isBroadMembershipQuery,
  isClassFollowUpQuery,
  isGeneralHoursQuery,
  keywordBoost,
  MIN_CONFIDENCE_SCORE,
  RAG_INJECT_CATEGORIES,
} from "./query-builder";
import {
  classifyQueryIntent,
  type IntentCategoryDescriptor,
  type IntentClassifierResult,
} from "./intent-classifier";
import {
  getGymConfig,
  getGymEmbeddings,
  type EmbeddingRecord,
  type GymCategory,
} from "../gym/config";
import { isPostgres } from "../db/driver";
import { searchGymChunksByVector } from "../gym/db-config";

const FALLBACK_OVERVIEW_CATEGORIES = [
  RAG_INJECT_CATEGORIES.membership,
  RAG_INJECT_CATEGORIES.classes,
  RAG_INJECT_CATEGORIES.personalTraining,
  RAG_INJECT_CATEGORIES.equipment,
] as const;

export function chunkIdsForCategories(
  records: EmbeddingRecord[],
  categories: readonly string[],
): string[] {
  const categorySet = new Set(categories);
  return records
    .filter((record) => categorySet.has(record.category))
    .map((record) => record.id);
}

/**
 * Legacy regex-based category collector. Used as a zero-latency fallback
 * when the LLM intent classifier returns no categories (e.g. on cold start,
 * timeout, missing API key, or unrecognized phrasing).
 */
export function collectRequiredCategoriesLegacy(
  latestUserMessage: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): string[] {
  const categories = new Set<string>();

  if (isBroadMembershipQuery(latestUserMessage)) {
    categories.add(RAG_INJECT_CATEGORIES.membership);
  }
  if (isClassFollowUpQuery(latestUserMessage, messages)) {
    categories.add(RAG_INJECT_CATEGORIES.classes);
  }
  if (isBroadGymOverviewQuery(latestUserMessage)) {
    for (const category of FALLBACK_OVERVIEW_CATEGORIES) {
      categories.add(category);
    }
  }
  if (isGeneralHoursQuery(latestUserMessage)) {
    categories.add(RAG_INJECT_CATEGORIES.hours);
  }

  return Array.from(categories);
}

function mergeRequiredChunks(
  results: SearchResult[],
  records: EmbeddingRecord[],
  requiredIds: readonly string[],
  topK: number,
): SearchResult[] {
  const merged = new Map<string, SearchResult>();

  for (const id of requiredIds) {
    const record = records.find((entry) => entry.id === id);
    if (!record) {
      continue;
    }
    merged.set(id, { ...record, score: 0.95 });
  }

  for (const result of results) {
    const existing = merged.get(result.id);
    if (!existing || result.score > existing.score) {
      merged.set(result.id, result);
    }
  }

  const limit = Math.max(topK, requiredIds.length);
  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface SearchResult extends EmbeddingRecord {
  score: number;
}

async function loadGymRecords(gymId: string): Promise<EmbeddingRecord[]> {
  const cached = getCachedGymRecords(gymId);
  if (cached) {
    return cached;
  }

  let records: EmbeddingRecord[];

  // Postgres tenants: prefer faq_chunks in the database (admin-editable source
  // of truth). Fall back to committed embeddings.json for local dev / demos.
  if (isPostgres) {
    try {
      const { getGymEmbeddingsFromDb } = await import("../gym/db-config");
      records = await getGymEmbeddingsFromDb(gymId);
      if (records.length > 0) {
        setCachedGymRecords(gymId, records);
        return records;
      }
    } catch (error) {
      console.warn(`[rag] db embeddings unavailable for ${gymId}`, error);
    }
  }

  try {
    records = getGymEmbeddings(gymId);
  } catch {
    if (isPostgres) {
      const { getGymEmbeddingsFromDb } = await import("../gym/db-config");
      records = await getGymEmbeddingsFromDb(gymId);
    } else {
      throw new Error(`No embeddings found for gym "${gymId}"`);
    }
  }

  setCachedGymRecords(gymId, records);
  return records;
}

export async function searchGymKnowledge(
  gymId: string,
  query: string,
  topK = 5,
): Promise<SearchResult[]> {
  const intent = detectSearchIntent(query);

  let queryEmbedding = getCachedQueryEmbedding(query);
  if (!queryEmbedding) {
    queryEmbedding = await embedText(query);
    setCachedQueryEmbedding(query, queryEmbedding);
  }

  // Postgres: use pgvector when faq_chunks exist in the database.
  if (isPostgres) {
    try {
      const candidates = await searchGymChunksByVector(
        gymId,
        queryEmbedding,
        Math.max(topK * 3, topK),
      );
      if (candidates.length > 0) {
        return candidates
          .map((candidate) => {
            const boost = keywordBoost(
              query,
              candidate.content,
              candidate.category,
              intent,
            );
            return {
              id: candidate.id,
              category: candidate.category,
              content: candidate.content,
              embedding: [],
              score: Math.min(candidate.similarity + boost, 1),
            } satisfies SearchResult;
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);
      }
    } catch (error) {
      console.warn(`[rag] pgvector search failed for ${gymId}`, error);
    }
  }

  const records = await loadGymRecords(gymId);
  const scored = records.map((record) => {
    const semantic = cosineSimilarity(queryEmbedding!, record.embedding);
    const boost = keywordBoost(query, record.content, record.category, intent);
    return {
      ...record,
      score: Math.min(semantic + boost, 1),
    };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

function toIntentDescriptors(categories: GymCategory[]): IntentCategoryDescriptor[] {
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    examples: category.examples,
  }));
}

export interface SearchFromMessagesResult {
  results: SearchResult[];
  lowConfidence: boolean;
  deferToFrontDesk: boolean;
  fullDump: boolean;
  query: string;
  intent: IntentClassifierResult;
  injectedCategories: string[];
}

export async function searchGymKnowledgeFromMessages(
  gymId: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  topK = 5,
): Promise<SearchFromMessagesResult> {
  const query = buildSearchQuery(messages);
  const lastAssistantMessage = getLastAssistantMessage(messages);
  const records = await loadGymRecords(gymId);

  let categories: GymCategory[] = [];
  try {
    const config = getGymConfig(gymId);
    categories = config.categories;
  } catch {
    categories = [];
  }

  // Run intent classifier in parallel with semantic search to hide latency.
  const intentPromise = classifyQueryIntent({
    gymId,
    latestUserMessage: query,
    lastAssistantMessage,
    availableCategories: toIntentDescriptors(categories),
  });

  const semanticPromise = query
    ? searchGymKnowledge(gymId, query, topK)
    : Promise.resolve<SearchResult[]>([]);

  const [intent, semanticResults] = await Promise.all([
    intentPromise,
    semanticPromise,
  ]);

  // Full-FAQ dump for broad overview intents — tiny corpora make this cheap
  // and eliminates retrieval gaps by construction.
  if (intent.fullDump && records.length > 0) {
    const dumped = records.map<SearchResult>((record) => ({
      ...record,
      score: 0.99,
    }));
    return {
      results: dumped,
      lowConfidence: false,
      deferToFrontDesk: false,
      fullDump: true,
      query,
      intent,
      injectedCategories: Array.from(
        new Set(records.map((record) => record.category)),
      ),
    };
  }

  // Resolve which categories to force-inject. Prefer the LLM classifier's
  // answer; fall back to the legacy regex injectors ONLY when the LLM did not
  // explicitly defer AND the classifier didn't produce an opinion. If the LLM
  // voted to defer to the front desk, NEVER run the legacy keyword fallback —
  // otherwise medical/legal/nutrition questions that happen to contain a
  // domain keyword (e.g. "HIIT") would force-inject category chunks against
  // the deferral signal.
  let requiredCategories = intent.categories;
  if (
    requiredCategories.length === 0 &&
    !intent.deferToFrontDesk &&
    intent.source !== "llm"
  ) {
    requiredCategories = collectRequiredCategoriesLegacy(query, messages);
  }

  // Off-topic / out-of-scope short-circuit: when the classifier explicitly
  // deferred AND no categories were resolved, return zero chunks instead of
  // leaking below-threshold "best two" results that would contradict the
  // deferral instruction in the system prompt.
  if (intent.deferToFrontDesk && requiredCategories.length === 0) {
    return {
      results: [],
      lowConfidence: true,
      deferToFrontDesk: true,
      fullDump: false,
      query,
      intent,
      injectedCategories: [],
    };
  }

  // Greeting / thanks short-circuit: the deterministic classifier emits
  // categories=[] for pure greetings and thanks. No RAG is needed — the
  // LLM should respond conversationally without random fallback chunks.
  if (
    intent.source === "deterministic" &&
    requiredCategories.length === 0 &&
    !intent.fullDump
  ) {
    return {
      results: [],
      lowConfidence: false,
      deferToFrontDesk: false,
      fullDump: false,
      query,
      intent,
      injectedCategories: [],
    };
  }

  let merged = semanticResults;
  if (requiredCategories.length > 0) {
    const requiredIds = chunkIdsForCategories(records, requiredCategories);
    merged = mergeRequiredChunks(
      semanticResults,
      records,
      requiredIds,
      Math.max(topK, requiredIds.length),
    );
  }

  const filtered = merged.filter((result) => result.score >= MIN_CONFIDENCE_SCORE);
  const finalResults = filtered.length > 0 ? filtered : merged.slice(0, 2);
  const lowConfidence = filtered.length === 0;

  return {
    results: finalResults,
    lowConfidence,
    deferToFrontDesk: intent.deferToFrontDesk,
    fullDump: false,
    query,
    intent,
    injectedCategories: requiredCategories,
  };
}

export function buildRagContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No relevant gym information was found.";
  }

  return results
    .map(
      (result, index) =>
        `[${index + 1}] (${result.category}, score ${result.score.toFixed(2)}) ${result.content}`,
    )
    .join("\n\n");
}
