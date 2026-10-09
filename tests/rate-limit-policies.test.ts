import { describe, expect, it } from "vitest";
import {
  ADMIN_LOGIN_RATE_LIMIT_POLICY,
  CHAT_RATE_LIMIT_POLICY,
  LEADS_RATE_LIMIT_POLICY,
} from "@/lib/rate-limit-policies";

describe("CHAT_RATE_LIMIT_POLICY", () => {
  it("keeps customer-facing limits generous", () => {
    expect(CHAT_RATE_LIMIT_POLICY.session).toEqual({
      limit: 60,
      windowMs: 60 * 60 * 1000,
    });
    expect(CHAT_RATE_LIMIT_POLICY.gym).toEqual({
      limit: 300,
      windowMs: 60 * 60 * 1000,
    });
    expect(CHAT_RATE_LIMIT_POLICY.ip).toEqual({
      limit: 120,
      windowMs: 60 * 60 * 1000,
    });
  });
});

describe("LEADS_RATE_LIMIT_POLICY", () => {
  it("allows retries while protecting each tenant", () => {
    expect(LEADS_RATE_LIMIT_POLICY.session).toEqual({
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    expect(LEADS_RATE_LIMIT_POLICY.gym).toEqual({
      limit: 50,
      windowMs: 60 * 60 * 1000,
    });
  });
});

describe("ADMIN_LOGIN_RATE_LIMIT_POLICY", () => {
  it("remains strict for brute-force protection", () => {
    expect(ADMIN_LOGIN_RATE_LIMIT_POLICY.ip).toEqual({
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
  });
});
