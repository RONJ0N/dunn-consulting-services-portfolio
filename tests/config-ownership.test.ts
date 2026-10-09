import { describe, expect, it } from "vitest";
import type { GymConfig } from "@/lib/gym/config";
import {
  applyAdminKnowledgePatch,
  applyAgencyBrandingPatch,
} from "@/lib/gym/config-ownership";

const base: GymConfig = {
  name: "Dunn Consulting",
  tagline: "old tagline",
  accentColor: "#002aff",
  tone: "old tone",
  address: "",
  allowedOrigins: ["client.com"],
  bookingUrl: "https://calendly.com/old",
  categories: [{ id: "sales", name: "Sales", injectOnIntents: [], keywords: [], examples: [] }],
  chat: { instructions: "Never quote prices." },
  branding: {
    greeting: "Hi from admin",
    accentColor: "#002aff",
    quickStarts: ["Hello"],
    ctaCopy: { tour: "Book", signup: "Start" },
  },
  twilio: {},
  missedCall: {},
  followup: {},
  notifications: {},
};

describe("applyAgencyBrandingPatch", () => {
  it("updates widget branding without touching chat or categories", () => {
    const next = applyAgencyBrandingPatch(base, {
      accentColor: "#34d399",
      branding: {
        greeting: "New greeting",
        quickStarts: ["What websites do you build?"],
      },
    });

    expect(next.branding?.greeting).toBe("New greeting");
    expect(next.accentColor).toBe("#34d399");
    expect(next.chat?.instructions).toBe("Never quote prices.");
    expect(next.categories[0]?.id).toBe("sales");
    expect(next.tagline).toBe("old tagline");
  });

  it("updates bookingEnabled without touching other fields", () => {
    const next = applyAgencyBrandingPatch(base, { bookingEnabled: false });
    expect(next.bookingEnabled).toBe(false);
    expect(next.bookingUrl).toBe("https://calendly.com/old");
    expect(next.chat?.instructions).toBe("Never quote prices.");
  });
});

describe("applyAdminKnowledgePatch", () => {
  it("updates knowledge config without touching widget branding", () => {
    const next = applyAdminKnowledgePatch(base, {
      tagline: "AI websites & chatbots",
      chat: { instructions: "Focus on websites and chatbots." },
      categories: [{ id: "websites", name: "Websites", injectOnIntents: [], keywords: [], examples: [] }],
    });

    expect(next.tagline).toBe("AI websites & chatbots");
    expect(next.chat?.instructions).toBe("Focus on websites and chatbots.");
    expect(next.categories[0]?.id).toBe("websites");
    expect(next.branding?.greeting).toBe("Hi from admin");
    expect(next.accentColor).toBe("#002aff");
    expect(next.allowedOrigins).toEqual(["client.com"]);
  });
});
