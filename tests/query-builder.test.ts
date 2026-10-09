import { describe, expect, it } from "vitest";
import {
  buildSearchQuery,
  getLastAssistantMessage,
  detectSearchIntent,
} from "@/lib/rag/query-builder";

describe("buildSearchQuery", () => {
  it("returns only the latest user message (kills query pollution)", () => {
    const messages = [
      { role: "user" as const, content: "give me the rundown" },
      { role: "assistant" as const, content: "Here's the rundown..." },
      { role: "user" as const, content: "what kind of classes do you have?" },
      { role: "assistant" as const, content: "Yoga, spin, HIIT..." },
      { role: "user" as const, content: "do you have personal trainers?" },
    ];
    expect(buildSearchQuery(messages)).toBe("do you have personal trainers?");
  });

  it("returns empty string when there are no user messages", () => {
    expect(buildSearchQuery([])).toBe("");
  });
});

describe("getLastAssistantMessage", () => {
  it("returns the most recent assistant message", () => {
    const messages = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "Hello!" },
      { role: "user" as const, content: "what's your name?" },
    ];
    expect(getLastAssistantMessage(messages)).toBe("Hello!");
  });

  it("returns null when there are no assistant messages", () => {
    expect(getLastAssistantMessage([{ role: "user", content: "hi" }])).toBeNull();
  });
});

describe("detectSearchIntent", () => {
  it("detects classes", () => {
    expect(detectSearchIntent("what classes do you offer?")).toBe("classes");
  });
  it("detects personal training", () => {
    expect(detectSearchIntent("do you have a trainer")).toBe("personal_training");
  });
  it("detects membership", () => {
    expect(detectSearchIntent("how much is membership")).toBe("membership");
  });
  it("falls back to general", () => {
    expect(detectSearchIntent("hi there")).toBe("general");
  });
});
