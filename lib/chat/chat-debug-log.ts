type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function isEnabled(): boolean {
  return (
    process.env.CHAT_DEBUG === "true" ||
    (process.env.NODE_ENV === "development" && process.env.CHAT_DEBUG !== "false")
  );
}

function timestamp(): string {
  return new Date().toISOString();
}

function formatTimestampForDisplay(iso: string): string {
  return iso.replace("T", " ").replace("Z", " UTC");
}

function divider(char = "─", width = 72): string {
  return char.repeat(width);
}

function logBlock(title: string, lines: string[]): void {
  if (!isEnabled()) {
    return;
  }

  const now = timestamp();
  console.log("");
  console.log(divider("═"));
  console.log(`[${formatTimestampForDisplay(now)}] ${title}`);
  for (const line of lines) {
    console.log(line);
  }
  console.log(divider("═"));
  console.log("");
}

export function logChatRequestStart(options: {
  sessionId: string;
  gymId: string;
  messages: ChatMessage[];
}): void {
  if (!isEnabled()) {
    return;
  }

  const now = timestamp();
  const historyLines = options.messages.map((message, index) => {
    const role = message.role.toUpperCase().padEnd(9, " ");
    return `  [${index + 1}] ${role} | ${message.content}`;
  });

  logBlock("CHAT REQUEST", [
    divider(),
    `session: ${options.sessionId}`,
    `gym:     ${options.gymId}`,
    `turns:   ${options.messages.length}`,
    `logged:  ${formatTimestampForDisplay(now)}`,
    divider(),
    "CONVERSATION HISTORY (copy from here)",
    ...historyLines,
    divider(),
  ]);
}

export function logClassifierDecision(options: {
  statusBefore: string;
  allowedActions: string;
  action: string;
  reason: string;
  latestUserMessage: string;
}): void {
  logBlock("LEAD CLASSIFIER", [
    divider(),
    `status before:     ${options.statusBefore}`,
    `allowed actions:   ${options.allowedActions}`,
    `latest user msg:   ${JSON.stringify(options.latestUserMessage)}`,
    `decision:          ${options.action.toUpperCase()}`,
    `reason:            ${options.reason}`,
    divider(),
  ]);
}

export function logLeadSessionUpdate(options: {
  statusBefore: string;
  statusAfter: string;
  leadName: string | null;
  leadPhone: string | null;
  leadGoals: string | null;
  validationNote?: string;
  completedLead?: { name: string; phone: string; goals: string } | null;
}): void {
  const lines = [
    divider(),
    `status before: ${options.statusBefore}`,
    `status after:  ${options.statusAfter}`,
    `lead name:     ${options.leadName ?? "(none)"}`,
    `lead phone:    ${options.leadPhone ?? "(none)"}`,
    `lead goals:    ${options.leadGoals ?? "(none)"}`,
  ];

  if (options.validationNote) {
    lines.push(`validation:    ${options.validationNote}`);
  }

  if (options.completedLead) {
    lines.push(
      `completed:     ${options.completedLead.name} | ${options.completedLead.phone} | ${options.completedLead.goals}`,
    );
  }

  lines.push(divider());

  logBlock("LEAD SESSION", lines);
}

export function logRagContext(options: {
  lowConfidence: boolean;
  chunkIds: string[];
  querySummary?: string;
}): void {
  logBlock("RAG", [
    divider(),
    `low confidence: ${options.lowConfidence}`,
    `chunks matched: ${options.chunkIds.length ? options.chunkIds.join(", ") : "(none)"}`,
    ...(options.querySummary ? [`query summary:  ${options.querySummary}`] : []),
    divider(),
  ]);
}

export function logAssistantTurn(options: {
  model: string;
  leadStatePrompt: string;
  assistantResponse: string;
  uiEvents: string[];
}): void {
  logBlock("ASSISTANT RESPONSE", [
    divider(),
    `model: ${options.model}`,
    ...(options.leadStatePrompt
      ? ["lead state prompt:", `  ${options.leadStatePrompt.replace(/\n/g, "\n  ")}`]
      : ["lead state prompt: (idle — consultative mode)"]),
    divider(),
    "response:",
    `  ${options.assistantResponse.replace(/\n/g, "\n  ")}`,
    divider(),
    ...(options.uiEvents.length
      ? ["ui events:", ...options.uiEvents.map((event) => `  - ${event}`)]
      : ["ui events: (none)"]),
    divider(),
  ]);
}

export function logLeadSaved(options: {
  lead: { name: string; phone: string; goals: string };
  smsSent: boolean;
  smsDisabled?: boolean;
  notificationError?: string | null;
}): void {
  logBlock("LEAD SAVED", [
    divider(),
    `name:   ${options.lead.name}`,
    `phone:  ${options.lead.phone}`,
    `goals:  ${options.lead.goals}`,
    `email:  ${
      options.smsDisabled
        ? "disabled (RESEND_API_KEY not set or no owner email)"
        : options.smsSent
          ? "sent"
          : "failed"
    }`,
    ...(options.notificationError
      ? [`error:  ${options.notificationError}`]
      : []),
    divider(),
  ]);
}

export function logChatError(error: unknown): void {
  if (!isEnabled()) {
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  logBlock("CHAT ERROR", [divider(), message, divider()]);
}

export function logChatValidationError(details: string): void {
  logBlock("CHAT VALIDATION ERROR (400)", [divider(), details, divider()]);
}
