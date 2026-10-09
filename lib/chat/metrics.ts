import { randomUUID } from "crypto";
import { chatTurnMetrics } from "@/lib/db/schema";
import { withTenantContext } from "@/lib/db/tenant-db";
import { logError } from "@/lib/observability/logger";

/**
 * gpt-4o-mini approximate pricing as of 2026 (per million tokens).
 * Update if you switch models or pricing changes.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};

function estimateCostUsd(
  model: string,
  promptTokens?: number,
  completionTokens?: number,
): number | null {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;
  const input = ((promptTokens ?? 0) / 1_000_000) * pricing.input;
  const output = ((completionTokens ?? 0) / 1_000_000) * pricing.output;
  return Number((input + output).toFixed(6));
}

export interface ChatTurnMetricInput {
  gymId: string;
  sessionId: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  ragChunkIds: string[];
  ragLowConfidence: boolean;
  ragFullDump: boolean;
  ragDeferred: boolean;
  intentSource: string;
}

export async function recordChatTurnMetric(
  input: ChatTurnMetricInput,
): Promise<void> {
  try {
    await withTenantContext(input.gymId, (tx) =>
      tx.insert(chatTurnMetrics).values({
        id: randomUUID(),
        gymId: input.gymId,
        sessionId: input.sessionId,
        model: input.model,
        promptTokens: input.promptTokens ?? null,
        completionTokens: input.completionTokens ?? null,
        latencyMs: input.latencyMs ?? null,
        ragChunkIds: input.ragChunkIds.join(","),
        ragLowConfidence: input.ragLowConfidence,
        ragFullDump: input.ragFullDump,
        ragDeferred: input.ragDeferred,
        intentSource: input.intentSource,
        estimatedCostUsd: estimateCostUsd(
          input.model,
          input.promptTokens,
          input.completionTokens,
        ),
        createdAt: new Date(),
      }),
    );
  } catch (error) {
    logError("chat.metrics.insertFailed", error, {
      gymId: input.gymId,
      sessionId: input.sessionId,
    });
  }
}
