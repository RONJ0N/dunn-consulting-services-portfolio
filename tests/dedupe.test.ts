import { describe, expect, it } from "vitest";
import { diffProposedChunks } from "@/lib/ingest/dedupe";

describe("diffProposedChunks", () => {
  it("detects added, unchanged, and removed chunks by id", () => {
    const existing = [
      { id: "membership-basic", category: "membership", content: "Basic is $29/month." },
      { id: "hours-weekday", category: "hours", content: "Open 5am to 11pm." },
    ];
    const proposed = [
      { id: "membership-basic", category: "membership", content: "Basic is $29/month." },
      { id: "membership-plus", category: "membership", content: "Plus is $49/month." },
    ];
    const diff = diffProposedChunks(proposed, existing);
    expect(diff.unchanged.map((c) => c.id)).toEqual(["membership-basic"]);
    expect(diff.added.map((c) => c.id)).toEqual(["membership-plus"]);
    expect(diff.removed.map((c) => c.id)).toEqual(["hours-weekday"]);
  });

  it("detects content drift on the same id", () => {
    const existing = [
      { id: "membership-basic", category: "membership", content: "Basic is $29/month." },
    ];
    const proposed = [
      { id: "membership-basic", category: "membership", content: "Basic is $34/month." },
    ];
    const diff = diffProposedChunks(proposed, existing);
    expect(diff.changed.map((c) => c.proposed.id)).toEqual(["membership-basic"]);
    expect(diff.added).toHaveLength(0);
  });

  it("matches semantically similar chunks even when ids differ", () => {
    const existing = [
      {
        id: "membership-plus",
        category: "membership",
        content: "Plus membership is $49 a month and includes group classes.",
      },
    ];
    const proposed = [
      {
        id: "tier-plus",
        category: "membership",
        content: "Plus membership is $49 a month and includes group classes.",
      },
    ];
    const diff = diffProposedChunks(proposed, existing);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].existing.id).toBe("membership-plus");
    expect(diff.changed[0].proposed.id).toBe("tier-plus");
  });
});
