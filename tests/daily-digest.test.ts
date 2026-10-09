import { describe, expect, it } from "vitest";
import { shouldSendDailyDigestNow } from "@/lib/followup/daily-digest";
import {
  localDateKey,
  localHour,
  previousDateKey,
} from "@/lib/timezone/local";

describe("timezone local helpers", () => {
  it("formats local date keys in America/New_York", () => {
    const date = new Date("2026-06-18T13:00:00.000Z");
    expect(localDateKey(date, "America/New_York")).toBe("2026-06-18");
    expect(localHour(date, "America/New_York")).toBe(9);
  });

  it("computes previous calendar date keys", () => {
    expect(previousDateKey("2026-06-18")).toBe("2026-06-17");
  });
});

describe("shouldSendDailyDigestNow", () => {
  const baseSettings = {
    enabled: true,
    timezone: "America/New_York",
    hour: 9,
    lastDigestForDate: null,
  };

  it("runs at 9 AM local when enabled and not yet sent", () => {
    const now = new Date("2026-06-18T13:00:00.000Z");
    const result = shouldSendDailyDigestNow(now, baseSettings);
    expect(result.run).toBe(true);
    expect(result.digestForDate).toBe("2026-06-17");
  });

  it("skips when disabled", () => {
    const now = new Date("2026-06-18T13:00:00.000Z");
    const result = shouldSendDailyDigestNow(now, {
      ...baseSettings,
      enabled: false,
    });
    expect(result.run).toBe(false);
  });

  it("skips outside the configured hour", () => {
    const now = new Date("2026-06-18T14:00:00.000Z");
    const result = shouldSendDailyDigestNow(now, baseSettings);
    expect(result.run).toBe(false);
  });

  it("skips when digest for that date was already sent", () => {
    const now = new Date("2026-06-18T13:00:00.000Z");
    const result = shouldSendDailyDigestNow(now, {
      ...baseSettings,
      lastDigestForDate: "2026-06-17",
    });
    expect(result.run).toBe(false);
  });
});
