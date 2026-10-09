import { describe, expect, it } from "vitest";
import { getGymConfig } from "@/lib/gym/config";
import {
  getLeadCaptureSettings,
  getGoalsPromptForSession,
  getLeadFieldLabel,
} from "@/lib/gym/lead-capture-config";
import { buildLeadStatePrompt } from "@/lib/chat/lead-session";
import type { ChatSession } from "@/lib/db/schema";

describe("lead capture settings", () => {
  it("uses 4-step flow with custom goals for dunn-consulting", () => {
    const settings = getLeadCaptureSettings(getGymConfig("dunn-consulting"));
    expect(settings.collectEmail).toBe(true);
    expect(settings.totalSteps).toBe(4);
    expect(settings.goalsPrompt).toContain("website");
    expect(settings.goalsFieldLabel).toBe("What you need help with");
    expect(settings.goalsValidationHint).not.toContain("fitness");
  });

  it("buildLeadStatePrompt uses business goals for dunn-consulting", () => {
    const settings = getLeadCaptureSettings(getGymConfig("dunn-consulting"));
    const session = {
      leadStatus: "collecting_goals",
      leadName: "Test User",
      leadPhone: "2025550147",
      leadEmail: "owner@example.com",
      leadGoals: "[Requested callback]",
    } as ChatSession;

    const prompt = buildLeadStatePrompt(session, settings);
    expect(prompt).not.toContain("membership tier");
    expect(prompt).not.toContain("fitness goals");
    expect(prompt).toContain("202-555-0147");
    expect(prompt).toContain("owner@example.com");
    expect(getGoalsPromptForSession(settings, session.leadGoals)).toContain(
      "website",
    );
    expect(getLeadFieldLabel("goals", settings)).toBe("What you need help with");
  });

  it("keeps 4-step gym flow for demo-gym", () => {
    const settings = getLeadCaptureSettings(getGymConfig("demo-gym"));
    expect(settings.collectEmail).toBe(true);
    expect(settings.totalSteps).toBe(4);
    expect(getGoalsPromptForSession(settings, null)).toContain("fitness");
  });

  it("uses generic validation hints when goalsPrompt is set without explicit hints", () => {
    const settings = getLeadCaptureSettings({
      ...getGymConfig("dunn-consulting"),
      chat: {
        leadCapture: {
          goalsPrompt: "Ask what service they need.",
        },
      },
    });
    expect(settings.goalsValidationHint).not.toContain("membership");
    expect(settings.affirmativeGoalsHint).not.toContain("membership");
  });
});
