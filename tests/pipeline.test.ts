import { describe, expect, it } from "vitest";
import {
  isPipelineStatus,
  parseLeadRefFromSms,
  parsePipelineStatusFromSms,
  leadRefFromId,
} from "@/lib/lead/pipeline";

describe("parsePipelineStatusFromSms", () => {
  it.each([
    ["contacted", "contacted"],
    ["CONTACTED", "contacted"],
    ["tour booked", "tour"],
    ["SIGNED", "signed"],
    ["Lost lead", "lost"],
  ])("parses %s → %s", (input, expected) => {
    expect(parsePipelineStatusFromSms(input)).toBe(expected);
  });

  it("returns null for unrelated text", () => {
    expect(parsePipelineStatusFromSms("hello")).toBeNull();
  });
});

describe("parseLeadRefFromSms", () => {
  it("extracts REF code", () => {
    expect(parseLeadRefFromSms("REF AB12 SIGNED")).toBe("AB12");
  });
  it("uppercases", () => {
    expect(parseLeadRefFromSms("ref ab12 signed")).toBe("AB12");
  });
  it("returns null when missing", () => {
    expect(parseLeadRefFromSms("just SIGNED")).toBeNull();
  });
});

describe("leadRefFromId", () => {
  it("returns first 4 uppercase chars of uuid sans dashes", () => {
    expect(leadRefFromId("abc1-2345-6789-defg")).toBe("ABC1");
  });
});

describe("isPipelineStatus", () => {
  it("validates correctly", () => {
    expect(isPipelineStatus("signed")).toBe(true);
    expect(isPipelineStatus("won")).toBe(false);
  });
});
