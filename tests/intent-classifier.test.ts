import { describe, expect, it } from "vitest";
import {
  classifyQueryIntent,
  clearIntentClassifierCache,
} from "@/lib/rag/intent-classifier";

const CATEGORIES = [
  { id: "membership", name: "Memberships" },
  { id: "classes", name: "Classes" },
  { id: "personal_training", name: "PT" },
];

describe("classifyQueryIntent — deterministic short-circuits", () => {
  it("handles greetings without LLM call", async () => {
    clearIntentClassifierCache();
    const result = await classifyQueryIntent({
      gymId: "demo-gym",
      latestUserMessage: "hi",
      availableCategories: CATEGORIES,
    });
    expect(result.source).toBe("deterministic");
    expect(result.categories).toEqual([]);
    expect(result.fullDump).toBe(false);
  });

  it("detects full overview requests", async () => {
    clearIntentClassifierCache();
    const result = await classifyQueryIntent({
      gymId: "demo-gym",
      latestUserMessage: "give me the rundown",
      availableCategories: CATEGORIES,
    });
    expect(result.source).toBe("deterministic");
    expect(result.fullDump).toBe(true);
    expect(result.categories).toEqual(["membership", "classes", "personal_training"]);
  });

  it("returns empty when no categories declared", async () => {
    clearIntentClassifierCache();
    const result = await classifyQueryIntent({
      gymId: "demo-gym",
      latestUserMessage: "anything",
      availableCategories: [],
    });
    expect(result.source).toBe("fallback");
    expect(result.categories).toEqual([]);
  });
});
