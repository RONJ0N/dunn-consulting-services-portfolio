import { describe, expect, it } from "vitest";
import {
  isValidName,
  isValidGoals,
  isAffirmativeOnly,
} from "@/lib/chat/lead-validation";

describe("isValidName", () => {
  it("accepts a normal full name", () => {
    expect(isValidName("Sam Wilson")).toBe(true);
  });
  it("rejects short input", () => {
    expect(isValidName("S")).toBe(false);
  });
  it("rejects question-shaped input", () => {
    expect(isValidName("what is your name")).toBe(false);
  });
  it("rejects affirmative-only input", () => {
    expect(isValidName("yes")).toBe(false);
  });
  it("rejects phone-shaped input", () => {
    expect(isValidName("5125550100")).toBe(false);
  });
});

describe("isValidGoals", () => {
  it("accepts goals", () => {
    expect(isValidGoals("I want to lose 20 lbs and build muscle")).toBe(true);
  });
  it("rejects single word affirmatives", () => {
    expect(isValidGoals("yes")).toBe(false);
  });
});

describe("isAffirmativeOnly", () => {
  it("matches affirmative one-word answers", () => {
    expect(isAffirmativeOnly("yes")).toBe(true);
    expect(isAffirmativeOnly("Sure")).toBe(true);
  });
  it("rejects substantive content", () => {
    expect(isAffirmativeOnly("yes I want a tour")).toBe(false);
  });
});

describe("isValidName — regression for corrupted-name bug", () => {
  it("rejects sentence-shaped input that started with a verb", () => {
    expect(
      isValidName("give me a full rundown on the gym, what it offers"),
    ).toBe(false);
  });
  it("rejects long pasted text", () => {
    expect(
      isValidName(
        "I want to know everything about the gym including hours pricing classes and more",
      ),
    ).toBe(false);
  });
  it("accepts hyphenated/apostrophe names", () => {
    expect(isValidName("Mary-Anne O'Brien")).toBe(true);
  });
});
