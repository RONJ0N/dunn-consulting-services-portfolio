import { getDefaultCategories, type GymCategory } from "./config";

export type OnboardVertical = "gym" | "local-business";

const LOCAL_BUSINESS_CATEGORIES: GymCategory[] = [
  {
    id: "services",
    name: "Services offered",
    description: "What the business does, core offerings, and how they help customers.",
    injectOnIntents: ["overview", "services"],
    keywords: [
      "service",
      "offer",
      "do you",
      "help with",
      "what do you",
      "how does",
      "work",
    ],
    examples: ["What services do you offer?", "How does this work?"],
  },
  {
    id: "contact",
    name: "Getting started and contact",
    description:
      "Phone, email, booking link, lead capture (name, phone, email), and follow-up.",
    injectOnIntents: ["overview", "contact"],
    keywords: [
      "book",
      "start",
      "call",
      "email",
      "contact",
      "get started",
      "follow up",
      "callback",
      "reach",
      "schedule",
    ],
    examples: ["How do I get started?", "Can someone call me back?"],
  },
  {
    id: "policies",
    name: "Policies and terms",
    description: "Privacy, SMS opt-out (reply STOP), and chat policies.",
    injectOnIntents: ["policies"],
    keywords: ["stop", "opt out", "sms", "text", "privacy", "policy"],
    examples: ["How do I stop receiving texts?"],
  },
];

export function getOnboardCategories(vertical: OnboardVertical): GymCategory[] {
  return vertical === "gym" ? getDefaultCategories() : LOCAL_BUSINESS_CATEGORIES;
}

export function getOnboardBrandingGreeting(
  vertical: OnboardVertical,
  name: string,
): string {
  if (vertical === "gym") {
    return `Hi! I'm the ${name} front desk assistant. Ask about hours, memberships, classes, or anything else — no pressure.`;
  }
  return `Hi! I'm ${name}'s virtual front desk. Ask me anything about our services or how to get started — I'm here to help.`;
}

export function getOnboardChatConfig(vertical: OnboardVertical, name: string) {
  if (vertical === "gym") {
    return {
      leadCapture: {
        goalsPrompt:
          "Ask for their fitness goals OR which membership tier they want (e.g. Basic, Plus, Premium).",
        goalsFieldLabel: "Fitness goals or membership",
        goalsValidationHint:
          "That doesn't look like a fitness goal or membership choice. Ask them again what they're hoping to achieve or which membership tier they want (e.g. Basic).",
        affirmativeGoalsHint:
          "They said yes but did not state a membership tier or goal. Ask which membership they want (e.g. Basic, Plus, Premium) before confirming.",
        completeFollowUp: "Our team will reach out soon.",
      },
    };
  }

  return {
    roleOverride: `virtual front desk assistant for ${name}, trained on their business information to help website visitors`,
    jobSummary: `1. Answer visitor questions about ${name} using only the business information below.\n2. Act like a helpful front desk rep — clear, friendly, and low pressure.\n3. When someone opts in to a callback or follow-up, guide them through lead capture; the system emails the team when their info is collected.`,
    instructions: `- You represent ${name} only — answer from the business information, not generic AI knowledge.\n- Lead capture is name, then phone, then email, then what they need help with.\n- Lead capture opt-ins include: call me back, book a call, get started, have someone reach out, or a clear yes after you offered follow-up.`,
    leadCapture: {
      goalsPrompt: `Ask what they need help with — for example scheduling, pricing, or a callback from ${name}.`,
      goalsFieldLabel: "What you need help with",
      goalsValidationHint:
        "That doesn't look like a clear answer. Ask again what they need help with.",
      affirmativeGoalsHint:
        "They said yes but didn't say what they need. Ask what they'd like help with before confirming.",
      completeFollowUp: "Our team will follow up shortly.",
    },
  };
}
