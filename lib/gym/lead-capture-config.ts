import type { GymConfig } from "./config";

export type LeadCaptureSettings = {
  collectEmail: boolean;
  totalSteps: number;
  goalsPrompt: string;
  goalsFieldLabel: string;
  goalsValidationHint: string;
  affirmativeGoalsHint: string;
  completeFollowUpDefault: string;
};

function intentLabel(goals: string | null): string {
  if (!goals) return "general";
  if (goals.includes("[Wants to sign up]")) return "signup";
  if (goals.includes("[Requested callback]")) return "callback";
  if (goals.includes("[Wants free day pass / trial]")) return "day_pass";
  if (goals.includes("[Wants to book a tour]")) return "tour";
  return "general";
}

function defaultGymGoalsPrompt(intent: string): string {
  if (intent === "signup") {
    return "Ask which membership tier they want (Basic, Plus, or Premium). Help them choose if needed, then confirm the tier.";
  }
  if (intent === "callback") {
    return "Ask what they'd like help with or which membership they're considering, so our team knows before calling.";
  }
  if (intent === "day_pass") {
    return "Ask what fitness goals they're hoping to work on, so we can point them to the right area of the gym.";
  }
  return "Ask for their fitness goals OR which membership tier they want (e.g. Basic, Plus, Premium).";
}

function defaultCompleteFollowUp(intent: string): string {
  if (intent === "signup") {
    return "Our team will call today to complete the signup and get payment sorted.";
  }
  if (intent === "callback") {
    return "Someone will call back shortly.";
  }
  if (intent === "day_pass") {
    return "Just stop by during staffed hours — we'll have your free day pass ready.";
  }
  if (intent === "tour") {
    return "Our team will call to confirm your tour time.";
  }
  return "Our team will reach out soon.";
}

export function getLeadCaptureSettings(config: GymConfig): LeadCaptureSettings {
  const lc = config.chat?.leadCapture;
  const collectEmail = lc?.collectEmail ?? true;
  const hasCustomGoals = Boolean(lc?.goalsPrompt?.trim());

  return {
    collectEmail,
    totalSteps: collectEmail ? 4 : 3,
    goalsPrompt: lc?.goalsPrompt ?? "",
    goalsFieldLabel: lc?.goalsFieldLabel ?? "",
    goalsValidationHint:
      lc?.goalsValidationHint ??
      (hasCustomGoals
        ? "That doesn't look like a clear answer. Ask them again what they need help with."
        : "That doesn't look like a fitness goal or membership choice. Ask them again what they're hoping to achieve or which membership tier they want (e.g. Basic)."),
    affirmativeGoalsHint:
      lc?.affirmativeGoalsHint ??
      (hasCustomGoals
        ? "They said yes but didn't say what they need. Ask what they'd like help with before confirming."
        : "They said yes but did not state a membership tier or goal. Ask which membership they want (e.g. Basic, Plus, Premium) before confirming."),
    completeFollowUpDefault: lc?.completeFollowUp ?? "",
  };
}

export function getGoalsPromptForSession(
  settings: LeadCaptureSettings,
  leadGoals: string | null,
): string {
  if (settings.goalsPrompt.trim()) {
    return settings.goalsPrompt;
  }
  return defaultGymGoalsPrompt(intentLabel(leadGoals));
}

export function getCompleteFollowUpForSession(
  settings: LeadCaptureSettings,
  leadGoals: string | null,
): string {
  if (settings.completeFollowUpDefault.trim()) {
    return settings.completeFollowUpDefault;
  }
  return defaultCompleteFollowUp(intentLabel(leadGoals));
}

export function getLeadFieldLabel(
  field: "name" | "phone" | "email" | "goals",
  settings: LeadCaptureSettings,
): string {
  switch (field) {
    case "name":
      return "Full name";
    case "phone":
      return "Phone number";
    case "email":
      return "Email address";
    case "goals":
      if (settings.goalsFieldLabel.trim()) {
        return settings.goalsFieldLabel;
      }
      return settings.goalsPrompt.trim()
        ? "What you need help with"
        : "Fitness goals or membership";
  }
}
