import { z } from "zod";
import {
  logAssistantTurn,
  logChatError,
  logChatRequestStart,
  logChatValidationError,
  logClassifierDecision,
  logLeadSaved,
  logLeadSessionUpdate,
  logRagContext,
} from "@/lib/chat/chat-debug-log";
import {
  buildConversationSummary,
  buildSystemPrompt,
} from "@/lib/chat/system-prompt";
import { classifyLeadCaptureAction } from "@/lib/chat/lead-classifier";
import {
  advanceLeadSession,
  buildLeadStatePrompt,
  getLeadFieldForStatus,
  getLeadStep,
  getOrCreateSession,
  markLeadSessionComplete,
  SessionGymMismatchError,
  syncLeadFieldsFromConversation,
} from "@/lib/chat/lead-session";
import { getGymConfig } from "@/lib/gym/config";
import { getLeadCaptureSettings, getLeadFieldLabel } from "@/lib/gym/lead-capture-config";
import { isRegisteredGym } from "@/lib/gym/registry";
import { verifyEmbedRequest } from "@/lib/embed/token";
import { CHAT_MODEL, getOpenAIClient } from "@/lib/openai";
import {
  appendChatMessage,
  getLeadRepository,
} from "@/lib/db/repository";
import { notifyLeadCaptured } from "@/lib/notifications";
import {
  getClientIp,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { checkChatRateLimits } from "@/lib/check-chat-rate-limits";
import {
  buildRagContext,
  searchGymKnowledgeFromMessages,
} from "@/lib/rag/search";
import { recordChatTurnMetric } from "@/lib/chat/metrics";
import { logError, logInfo, startTimer } from "@/lib/observability/logger";
import type { CaptureLeadStatus } from "@/lib/db/schema";

const messageSchema = z.discriminatedUnion("role", [
  // User messages: cap at 2000 chars, must not be whitespace-only.
  z.object({
    role: z.literal("user"),
    content: z.string().trim().min(1).max(2000),
  }),
  // Assistant messages sent back as history can be longer (full FAQ dumps ~3–5k chars).
  z.object({
    role: z.literal("assistant"),
    content: z.string().trim().min(1).max(12000),
  }),
]);

const chatSchema = z.object({
  sessionId: z.string().trim().min(8).max(64),
  // gymId is REQUIRED — no demo-gym fallback. The widget always supplies it.
  gymId: z.string().trim().min(1).max(64),
  messages: z.array(messageSchema).max(50),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, gymId, messages } = chatSchema.parse(body);

    const ip = getClientIp(request);
    const limitFailure = await checkChatRateLimits({ sessionId, gymId, ip });
    if (limitFailure) {
      return rateLimitResponse(
        limitFailure.retryAfterMs,
        "You're sending messages quickly - please wait a moment and try again.",
      );
    }

    // Embed-only gate: reject made-up / unregistered tenants with a 404
    // BEFORE any OpenAI call so random URLs never cost money or leak behavior.
    if (!(await isRegisteredGym(gymId))) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    // Optional per-gym signed embed token. Enforced only when configured so
    // existing embeds keep working until tokens are rolled out.
    if (!verifyEmbedRequest(request, gymId)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    if (!latestUserMessage) {
      return Response.json({ error: "No user message provided" }, { status: 400 });
    }

    // DB-onboarded tenants have no folder on disk — hydrate the config cache
    // from the gyms table before any sync getGymConfig() call.
    const { ensureGymLoaded } = await import("@/lib/gym/db-config");
    await ensureGymLoaded(gymId);

    const config = getGymConfig(gymId);

    // Persist the widget's greeting on the FIRST turn so transcripts always
    // start with the assistant message the user actually saw.
    const firstAssistantMessage = messages.find(
      (message) => message.role === "assistant",
    );
    const existingSession = await getOrCreateSession(sessionId, gymId);
    const isFirstTurn = existingSession.createdAt.getTime() === existingSession.updatedAt.getTime();

    if (isFirstTurn && firstAssistantMessage) {
      await appendChatMessage({
        sessionId,
        gymId,
        role: "assistant",
        content: firstAssistantMessage.content,
      });
    }

    await appendChatMessage({
      sessionId,
      gymId,
      role: "user",
      content: latestUserMessage.content,
    });

    let session = existingSession;
    const statusBefore = session.leadStatus;

    logChatRequestStart({ sessionId, gymId, messages });

    const classifier = await classifyLeadCaptureAction(
      messages,
      session.leadStatus as CaptureLeadStatus,
    );

    logClassifierDecision({
      statusBefore,
      allowedActions: classifier.allowedActions,
      action: classifier.action,
      reason: classifier.reason,
      latestUserMessage: latestUserMessage.content,
    });

    const leadCaptureSettings = getLeadCaptureSettings(config);

    session = await syncLeadFieldsFromConversation(
      session,
      messages,
      leadCaptureSettings,
    );
    const advanceResult = await advanceLeadSession(
      session,
      latestUserMessage.content,
      classifier.action,
      leadCaptureSettings,
    );
    session = advanceResult.session;

    logLeadSessionUpdate({
      statusBefore,
      statusAfter: session.leadStatus,
      leadName: session.leadName,
      leadPhone: session.leadPhone,
      leadGoals: session.leadGoals,
      validationNote:
        advanceResult.validationNote ||
        (advanceResult.phoneInvalid
          ? "Invalid phone"
          : advanceResult.nameInvalid
            ? "Invalid name"
            : advanceResult.goalsInvalid
              ? "Invalid goals"
              : undefined),
      completedLead: advanceResult.completedLead,
    });

    const {
      results,
      lowConfidence,
      deferToFrontDesk,
      fullDump,
      query,
      intent,
      injectedCategories,
    } = await searchGymKnowledgeFromMessages(gymId, messages);

    logRagContext({
      lowConfidence,
      chunkIds: results.map((result) => result.id),
      querySummary: `${query} | intent=${intent.source}:${intent.reason} | categories=[${injectedCategories.join(",")}] | fullDump=${fullDump} | defer=${deferToFrontDesk}`,
    });
    const ragContext = buildRagContext(results);
    const leadStatePrompt = buildLeadStatePrompt(session, leadCaptureSettings);

    let phoneInvalidNote = "";
    if (
      advanceResult.phoneInvalid ||
      advanceResult.emailInvalid ||
      advanceResult.nameInvalid ||
      advanceResult.goalsInvalid
    ) {
      phoneInvalidNote = advanceResult.validationNote;
    }

    const systemPrompt = buildSystemPrompt(config, ragContext, {
      leadStatePrompt: `${leadStatePrompt}${phoneInvalidNote ? `\nImportant: ${phoneInvalidNote}` : ""}`,
      lowConfidence,
      deferToFrontDesk,
      fullDump,
      publicPhone: config.publicPhone,
    });

    // Trim conversation history sent to OpenAI.
    // - Keep the last 12 turns (6 exchanges) for context.
    // - Hard-cap each message at 6000 chars so a prior full-dump assistant
    //   response doesn't bloat the prompt on the next turn.
    const trimmedMessages = messages.slice(-12).map((message) => ({
      role: message.role,
      content:
        message.content.length > 6000
          ? message.content.slice(0, 6000) + " [truncated]"
          : message.content,
    }));

    const openai = getOpenAIClient();
    const elapsed = startTimer();
    const stream = await openai.chat.completions.create({
      model: CHAT_MODEL,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: systemPrompt },
        ...trimmedMessages,
      ],
    });

    const encoder = new TextEncoder();
    let fullAssistantText = "";
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (delta) {
              fullAssistantText += delta;
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ type: "text", content: delta }) + "\n",
                ),
              );
            }
            if (chunk.usage) {
              promptTokens = chunk.usage.prompt_tokens;
              completionTokens = chunk.usage.completion_tokens;
            }
          }

          const cleanedText = fullAssistantText.trim();
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: "replace", content: cleanedText }) + "\n",
            ),
          );

          const uiEvents: string[] = [];
          let responseSession = session;

          if (advanceResult.completedLead) {
            const repository = getLeadRepository();
            const lead = await repository.create({
              gymId,
              sessionId,
              name: advanceResult.completedLead.name,
              phone: advanceResult.completedLead.phone,
              email: advanceResult.completedLead.email,
              goals: advanceResult.completedLead.goals,
              conversationSummary: buildConversationSummary(messages),
            });

            responseSession = await markLeadSessionComplete(
              sessionId,
              gymId,
              advanceResult.completedLead.goals,
            );

            const notification = await notifyLeadCaptured(lead);

            uiEvents.push("lead_clear");
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "lead_clear" }) + "\n"),
            );

            uiEvents.push(
              `lead_saved: ${lead.name} | sms ${notification.smsDisabled ? "disabled" : notification.smsSent ? "sent" : "failed"}`,
            );

            logLeadSaved({
              lead: {
                name: lead.name,
                phone: lead.phone,
                goals: lead.goals,
              },
              smsSent: notification.smsSent,
              smsDisabled: notification.smsDisabled,
              notificationError: notification.smsDisabled
                ? null
                : notification.errors[0] ?? null,
            });

            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "lead_saved",
                  smsSent: notification.smsSent,
                  smsDisabled: notification.smsDisabled,
                  notificationError: notification.smsDisabled
                    ? null
                    : notification.errors[0] ?? null,
                  lead: {
                    name: lead.name,
                    phone: lead.phone,
                    email: lead.email ?? "",
                    goals: lead.goals,
                  },
                }) + "\n",
              ),
            );
          } else {
            const leadStatus = session.leadStatus as CaptureLeadStatus;
            const leadStep = getLeadStep(leadStatus, leadCaptureSettings);
            const leadField = getLeadFieldForStatus(leadStatus);

            if (leadStep && leadField) {
              const label = getLeadFieldLabel(leadField, leadCaptureSettings);
              uiEvents.push(
                `lead_step: ${leadStep}/${leadCaptureSettings.totalSteps} ${leadField} (${label})`,
              );
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: "lead_step",
                    step: leadStep,
                    totalSteps: leadCaptureSettings.totalSteps,
                    field: leadField,
                    label,
                  }) + "\n",
                ),
              );
            } else {
              uiEvents.push("lead_clear");
              controller.enqueue(
                encoder.encode(JSON.stringify({ type: "lead_clear" }) + "\n"),
              );
            }
          }

          logAssistantTurn({
            model: CHAT_MODEL,
            leadStatePrompt: advanceResult.completedLead
              ? buildLeadStatePrompt(responseSession, leadCaptureSettings)
              : `${leadStatePrompt}${phoneInvalidNote ? `\nImportant: ${phoneInvalidNote}` : ""}`,
            assistantResponse: cleanedText,
            uiEvents,
          });

          if (cleanedText) {
            await appendChatMessage({
              sessionId,
              gymId,
              role: "assistant",
              content: cleanedText,
            });
          }

          await recordChatTurnMetric({
            gymId,
            sessionId,
            model: CHAT_MODEL,
            promptTokens,
            completionTokens,
            latencyMs: elapsed(),
            ragChunkIds: results.map((result) => result.id),
            ragLowConfidence: lowConfidence,
            ragFullDump: fullDump,
            ragDeferred: deferToFrontDesk,
            intentSource: `${intent.source}:${intent.reason.slice(0, 80)}`,
          });

          logInfo("chat.turn", {
            gymId,
            sessionId,
            latencyMs: elapsed(),
            promptTokens,
            completionTokens,
            chunkCount: results.length,
            lowConfidence,
            fullDump,
            deferToFrontDesk,
          });

          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "done" }) + "\n"),
          );
          controller.close();
        } catch (error) {
          logError("chat.streamFailed", error, { gymId, sessionId });
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      logChatValidationError(details);
      return Response.json({ error: error.flatten() }, { status: 400 });
    }

    if (error instanceof SessionGymMismatchError) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    logChatError(error);
    logError("chat.routeFailed", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate response";
    return Response.json({ error: message }, { status: 500 });
  }
}
