import { describe, expect, it } from "vitest";
import {
  getOnboardBrandingGreeting,
  getOnboardCategories,
  getOnboardChatConfig,
} from "@/lib/gym/onboard-templates";

describe("onboard templates", () => {
  it("defaults local-business vertical to non-gym lead capture", () => {
    const chat = getOnboardChatConfig("local-business", "Acme HVAC");
    expect(chat.leadCapture?.goalsPrompt).toContain("Acme HVAC");
    expect(chat.leadCapture?.goalsPrompt).not.toContain("membership");
    expect(chat.instructions).toContain("email");
  });

  it("uses gym categories and membership language for gym vertical", () => {
    const categories = getOnboardCategories("gym");
    expect(categories.some((c) => c.id === "membership")).toBe(true);
    const chat = getOnboardChatConfig("gym", "Iron Boxing");
    expect(chat.leadCapture?.goalsPrompt).toContain("membership");
  });

  it("uses local-business greeting without gym jargon", () => {
    const greeting = getOnboardBrandingGreeting("local-business", "Summit Home");
    expect(greeting).not.toContain("memberships");
    expect(greeting).toContain("Summit Home");
  });
});
