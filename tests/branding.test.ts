import { describe, expect, it } from "vitest";
import {
  buildPublicWidgetConfig,
  DEFAULT_QUICK_STARTS,
  isBookingCtaEnabled,
} from "@/lib/gym/branding";
import type { GymConfig } from "@/lib/gym/config";

const sampleConfig: GymConfig = {
  name: "Acme HVAC",
  tagline: "",
  accentColor: "#0f172a",
  address: "",
  tone: "professional",
  allowedOrigins: [],
  categories: [],
  chat: {},
  notifications: {},
  branding: {
    greeting: "Hello from Acme",
    quickStarts: ["Do you serve Round Rock?", "Emergency service?"],
    ctaCopy: { tour: "Book a visit", signup: "Get a quote" },
  },
  twilio: {},
  missedCall: {},
  followup: {},
};

describe("buildPublicWidgetConfig", () => {
  it("uses tenant quickStarts when configured", () => {
    const payload = buildPublicWidgetConfig("acme-hvac", sampleConfig);
    expect(payload.branding.quickStarts).toEqual([
      "Do you serve Round Rock?",
      "Emergency service?",
    ]);
  });

  it("falls back to defaults when quickStarts omitted", () => {
    const payload = buildPublicWidgetConfig("acme-hvac", {
      ...sampleConfig,
      branding: { greeting: "Hi" },
    });
    expect(payload.branding.quickStarts).toEqual(DEFAULT_QUICK_STARTS);
  });

  it("hides bookingUrl in public config when bookingEnabled is false", () => {
    const payload = buildPublicWidgetConfig("acme-hvac", {
      ...sampleConfig,
      bookingUrl: "https://calendly.com/acme",
      bookingEnabled: false,
    });
    expect(payload.bookingUrl).toBeNull();
  });

  it("shows bookingUrl when enabled explicitly", () => {
    const payload = buildPublicWidgetConfig("acme-hvac", {
      ...sampleConfig,
      bookingUrl: "https://calendly.com/acme",
      bookingEnabled: true,
    });
    expect(payload.bookingUrl).toBe("https://calendly.com/acme");
  });
});

describe("isBookingCtaEnabled", () => {
  it("defaults to true when bookingUrl is set and flag omitted", () => {
    expect(
      isBookingCtaEnabled({
        ...sampleConfig,
        bookingUrl: "https://calendly.com/acme",
      }),
    ).toBe(true);
  });

  it("defaults to false when no url and flag omitted", () => {
    expect(isBookingCtaEnabled(sampleConfig)).toBe(false);
  });
});
