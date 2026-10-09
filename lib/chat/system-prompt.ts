import { type GymConfig } from "../gym/config";
import type { CaptureLeadStatus } from "../db/schema";

export interface BuildSystemPromptOptions {
  leadStatePrompt?: string;
  lowConfidence?: boolean;
  deferToFrontDesk?: boolean;
  fullDump?: boolean;
  publicPhone?: string;
}

const DEFAULT_LEAD_SECTION = `\nConversation approach (lead capture NOT active yet):
- Answer the visitor's question first — be helpful, clear, and zero pressure.
- You are a virtual front desk: inform using the business information below, then offer a natural next step when it fits (don't repeat every reply).
- Good next steps: offer a callback, invite them to book via the booking link, or say you can collect their info so the team can follow up by email.
- Do NOT ask for name, phone, or email while they are still exploring.
- Lead capture starts when they opt in: "call me back", "book a call", "I'd like to get started", "have someone reach out", or a clear yes after you offered follow-up.

When lead capture IS active (shown above):
- Follow the current step exactly — one field at a time: name, then phone, then what they need help with.
- Do NOT ask for email unless the system prompt says so.
- When confirming after completion, say the team will follow up soon — the system emails the business owner when lead capture completes.
- Do NOT confirm submission until lead capture state says complete.\n`;

export function buildSystemPrompt(
  config: GymConfig,
  ragContext: string,
  options?: BuildSystemPromptOptions,
): string {
  const phone = options?.publicPhone ?? config.publicPhone ?? "";
  const handoffLine = phone
    ? `For immediate help, call ${phone}.`
    : config.contactEmail
      ? `For a human, email ${config.contactEmail}.`
      : "";

  const confidenceRule = (() => {
    if (options?.deferToFrontDesk) {
      return `This question is outside what the business information covers. Respond with ONLY a short, friendly deferral: "I don't have that on hand — our team${phone ? ` at ${phone}` : ""} can confirm. Anything else I can help with?" Do not attempt to answer. Do not guess.`;
    }
    if (options?.lowConfidence) {
      return `No reliable information was found for this question. Respond with ONLY a single concise sentence acknowledging you don't have that detail and offering to have someone on the team${phone ? ` at ${phone}` : ""} follow up. Do not guess prices, hours, services, or policies. Do not say things like "generally" or "typically".`;
    }
    if (options?.fullDump) {
      return "Answer ONLY using the business information provided below. Use it comprehensively. When listing services or offerings, list ALL of them present in the business information. Never claim something does not exist if it appears in the business information.";
    }
    return "Answer ONLY using the business information provided below — you are trained on this business's content, not generic web knowledge. Do not invent prices, hours, services, or policies. If multiple options appear in the business information, describe all of them. If the business information does not contain the answer, say so and offer to have the team follow up.";
  })();

  const leadSection = options?.leadStatePrompt
    ? `\nCurrent lead capture state:\n${options.leadStatePrompt}\n`
    : DEFAULT_LEAD_SECTION;

  const roleLine =
    config.chat?.roleOverride ??
    `virtual front desk assistant for ${config.name}${config.address ? ` (${config.address})` : ""}, trained on their business information to help website visitors`;

  const jobList =
    config.chat?.jobSummary ??
    `1. Answer website visitors' questions using the business information below.
2. Act like a helpful front desk rep — clear, friendly, and low pressure.
3. When someone opts in to a callback or follow-up, guide them through lead capture; the system emails the business when their info is collected.`;

  const tenantInstructions = config.chat?.instructions
    ? `\nAdditional instructions for this business:\n${config.chat.instructions}\n`
    : "";

  return `You are the ${roleLine}

Personality: ${config.tone}.

Your job:
${jobList}

Rules:
- ${confidenceRule}
- If you do not have enough information, say: "I'll have our team confirm that for you."
- Keep responses concise (2-4 sentences). Use short paragraphs instead of long numbered lists unless listing multiple services or options.
- Be helpful and conversational.
- ${handoffLine}
${tenantInstructions}${leadSection}
Business information:
${ragContext}`;
}

export function buildConversationSummary(
  messages: Array<{ role: string; content: string }>,
  limit = 8,
): string {
  return messages
    .slice(-limit)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}

export function getLeadStatusLabel(status: CaptureLeadStatus): string | null {
  switch (status) {
    case "collecting_name":
      return "Full name";
    case "collecting_phone":
      return "Phone number";
    case "collecting_goals":
      return "What they need help with";
    default:
      return null;
  }
}
