"use client";

import ReactMarkdown from "react-markdown";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

interface ChatWidgetProps {
  gymId?: string;
  /** Optional overrides — when omitted, fetched from /api/gym/:id/config */
  gymName?: string;
  accentColor?: string;
  publicPhone?: string;
  greeting?: string;
  /** Per-gym quick-reply chips; fetched from config when omitted. */
  quickStarts?: string[];
  /** Per-gym signed embed token forwarded to the API (when configured). */
  embedToken?: string;
  defaultOpen?: boolean;
}

interface GymBrandingPayload {
  gymId: string;
  name: string;
  publicPhone: string;
  bookingUrl?: string | null;
  branding: {
    accentColor: string;
    logoUrl: string | null;
    greeting: string;
    quickStarts: string[];
    ctaCopy: { tour: string; signup: string };
  };
}

import { DEFAULT_QUICK_STARTS } from "@/lib/gym/branding";

const EMBED_RESIZE_MESSAGE = "gym-ai-embed-resize";
const EMBED_SIZE_CLOSED = { width: 88, height: 88 };
const EMBED_SIZE_OPEN = { width: 400, height: 680 };

function postEmbedSize(isOpen: boolean) {
  if (typeof window === "undefined" || window.parent === window) {
    return;
  }
  const size = isOpen ? EMBED_SIZE_OPEN : EMBED_SIZE_CLOSED;
  window.parent.postMessage(
    { type: EMBED_RESIZE_MESSAGE, width: size.width, height: size.height },
    "*",
  );
}

/**
 * Generate a fresh session id for every page load. We deliberately do NOT
 * persist it across refreshes — each page load starts a clean chat, which
 * matches how customers expect "refresh = start over" to work.
 */
function makeSessionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** When true, completed leads are remembered in localStorage for a "Welcome back" greeting on a later visit. Off by default so refresh = clean demo. */
function isReturningLeadGreetingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_RETURNING_LEAD_GREETING === "true";
}

function clearReturningLeadHint(gymId: string): void {
  try {
    localStorage.removeItem(`gym-ai-lead-${gymId}`);
  } catch {
    /* localStorage may be disabled */
  }
}

/**
 * Returning-lead hint (optional). Only used when NEXT_PUBLIC_RETURNING_LEAD_GREETING=true.
 */
function getReturningLeadHint(
  gymId: string,
): { name: string; phone: string } | null {
  if (!isReturningLeadGreetingEnabled()) {
    return null;
  }
  try {
    const raw = localStorage.getItem(`gym-ai-lead-${gymId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { name?: unknown; phone?: unknown };
    if (typeof parsed.name !== "string" || typeof parsed.phone !== "string") {
      clearReturningLeadHint(gymId);
      return null;
    }
    const name = parsed.name.trim();
    const phone = parsed.phone.trim();
    const looksLikeRealName =
      name.length >= 2 &&
      name.length <= 60 &&
      /^[A-Za-z][A-Za-z\s'.-]*$/.test(name) &&
      name.split(/\s+/).length <= 4;
    const looksLikePhone = /^[0-9+\-() ]{7,20}$/.test(phone);
    if (!looksLikeRealName || !looksLikePhone) {
      clearReturningLeadHint(gymId);
      return null;
    }
    return { name, phone };
  } catch {
    return null;
  }
}

export default function ChatWidget({
  gymId = "demo-gym",
  gymName: gymNameProp,
  accentColor: accentColorProp,
  publicPhone: publicPhoneProp,
  greeting: greetingProp,
  quickStarts: quickStartsProp,
  embedToken,
  defaultOpen = false,
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [leadStep, setLeadStep] = useState<number | null>(null);
  const [leadStepTotal, setLeadStepTotal] = useState(4);
  const [leadFieldLabel, setLeadFieldLabel] = useState<string | null>(null);
  const [leadField, setLeadField] = useState<"name" | "phone" | "email" | "goals" | null>(
    null,
  );
  const [leadSaved, setLeadSaved] = useState(false);
  const [smsSent, setSmsSent] = useState<boolean | null>(null);
  const [notificationNote, setNotificationNote] = useState<string | null>(null);
  const [branding, setBranding] = useState<GymBrandingPayload | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const gymName = branding?.name ?? gymNameProp ?? "Iron Valley Fitness";
  const accentColor =
    branding?.branding.accentColor ?? accentColorProp ?? "#E63946";
  const publicPhone =
    branding?.publicPhone || publicPhoneProp || "(512) 555-0198";
  const quickStarts =
    branding?.branding.quickStarts ??
    quickStartsProp ??
    DEFAULT_QUICK_STARTS;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/gym/${gymId}/config`, {
      headers: embedToken ? { "x-embed-token": embedToken } : undefined,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setBranding(data as GymBrandingPayload);
      })
      .catch(() => {
        /* fall back to prop defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [gymId, embedToken]);

  useEffect(() => {
    // Legacy session id + returning-lead hint: drop on every page load so
    // refresh always feels like a new chat (unless re-engagement is enabled).
    try {
      localStorage.removeItem(`gym-ai-session-${gymId}`);
    } catch {
      /* localStorage may be disabled */
    }
    if (!isReturningLeadGreetingEnabled()) {
      clearReturningLeadHint(gymId);
    }

    setSessionId(makeSessionId());

    const baseGreeting =
      branding?.branding.greeting ??
      greetingProp ??
      `Hi! I'm the ${gymName} front desk assistant. Ask about hours, memberships, classes, or policies — no pressure. When you're ready, I can help book a tour or get you signed up.`;

    const returningLead = getReturningLeadHint(gymId);
    const greeting = returningLead
      ? `Welcome back, ${returningLead.name.split(" ")[0]}! Did you end up checking us out? Anything I can help with today?`
      : baseGreeting;

    setMessages([{ role: "assistant", content: greeting }]);
  }, [gymId, gymName, branding, greetingProp]);

  const inputType = useMemo(() => {
    if (leadField === "phone") return "tel";
    if (leadField === "email") return "email";
    return "text";
  }, [leadField]);

  const inLeadFlow = leadStep !== null && !leadSaved;

  useEffect(() => {
    function handleOpenChat() {
      setIsOpen(true);
    }

    window.addEventListener("gym-ai-open-chat", handleOpenChat);
    return () => window.removeEventListener("gym-ai-open-chat", handleOpenChat);
  }, []);

  useEffect(() => {
    postEmbedSize(isOpen);
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, leadSaved]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    inputRef.current?.focus();
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading || !sessionId) {
        return;
      }

      const nextMessages: Message[] = [
        ...messages,
        { role: "user", content: trimmed },
      ];
      setMessages(nextMessages);
      setInput("");
      setIsLoading(true);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(embedToken ? { "x-embed-token": embedToken } : {}),
          },
          body: JSON.stringify({ sessionId, gymId, messages: nextMessages }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error ?? "Chat request failed");
        }

        if (!response.body) {
          throw new Error("No response stream");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantText = "";
        let buffer = "";

        setMessages((current) => [
          ...current,
          { role: "assistant", content: "" },
        ]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) {
              continue;
            }

            const event = JSON.parse(line) as
              | { type: "text"; content: string }
              | { type: "replace"; content: string }
              | {
                  type: "lead_step";
                  step: number;
                  totalSteps?: number;
                  field: "name" | "phone" | "email" | "goals";
                  label: string;
                }
              | {
                  type: "lead_saved";
                  smsSent: boolean;
                  smsDisabled?: boolean;
                  notificationError?: string | null;
                  lead: { name: string; phone: string; email: string; goals: string };
                }
              | { type: "lead_clear" }
              | { type: "done" };

            if (event.type === "text") {
              assistantText += event.content;
              setMessages((current) => {
                const updated = [...current];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantText,
                };
                return updated;
              });
            }

            if (event.type === "replace") {
              assistantText = event.content;
              setMessages((current) => {
                const updated = [...current];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantText,
                };
                return updated;
              });
            }

            if (event.type === "lead_step") {
              setLeadStep(event.step);
              setLeadStepTotal(event.totalSteps ?? 4);
              setLeadField(event.field);
              setLeadFieldLabel(event.label);
            }

            if (event.type === "lead_clear") {
              setLeadStep(null);
              setLeadField(null);
              setLeadFieldLabel(null);
            }

            if (event.type === "lead_saved") {
              setLeadSaved(true);
              setLeadStep(null);
              setLeadField(null);
              setSmsSent(event.smsDisabled ? null : event.smsSent);
              setNotificationNote(
                event.smsDisabled
                  ? null
                  : event.smsSent
                    ? null
                    : event.notificationError ??
                        "Lead saved, but SMS alert could not be sent. Check Twilio config in .env.",
              );
              if (isReturningLeadGreetingEnabled()) {
                try {
                  const name = String(event.lead.name ?? "").trim();
                  const phone = String(event.lead.phone ?? "").trim();
                  const realName =
                    name.length >= 2 &&
                    name.length <= 60 &&
                    /^[A-Za-z][A-Za-z\s'.-]*$/.test(name) &&
                    name.split(/\s+/).length <= 4;
                  const realPhone = /^[0-9+\-() ]{7,20}$/.test(phone);
                  if (realName && realPhone) {
                    localStorage.setItem(
                      `gym-ai-lead-${gymId}`,
                      JSON.stringify({ name, phone }),
                    );
                  }
                } catch {
                  /* localStorage might be disabled */
                }
              }
            }
          }
        }
      } catch {
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: `Sorry, I'm having trouble right now. For immediate help, call us at ${publicPhone}.`,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [embedToken, gymId, isLoading, messages, publicPhone, sessionId],
  );

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {isOpen && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${gymName} chat`}
          aria-live="polite"
          className="flex h-[min(560px,calc(100dvh-6rem))] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        >
          <div
            className="px-4 py-4 text-white"
            style={{ backgroundColor: accentColor }}
          >
            <p className="text-sm font-medium opacity-90">Questions? We can help</p>
            <div className="flex items-center gap-2">
              {branding?.branding.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote client logos, plain img keeps the widget framework-free
                <img
                  src={branding.branding.logoUrl}
                  alt=""
                  className="h-7 w-7 rounded-full bg-white object-contain p-0.5"
                />
              ) : null}
              <h2 className="text-lg font-semibold">{gymName}</h2>
            </div>
            {branding?.bookingUrl ? (
              <a
                href={branding.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block rounded-lg bg-white/20 px-3 py-1 text-xs font-semibold text-white hover:bg-white/30"
              >
                Book an appointment →
              </a>
            ) : null}
            {inLeadFlow && (
              <p className="mt-1 text-xs opacity-90">
                Step {leadStep} of {leadStepTotal} —{" "}
                {leadFieldLabel ??
                  (leadField === "phone"
                    ? "Phone number"
                    : leadField === "name"
                      ? "Full name"
                      : leadField === "email"
                        ? "Email address"
                        : "What you need help with")}
              </p>
            )}
            {leadSaved && (
              <p className="mt-1 text-xs opacity-90">
                Lead saved — our team will follow up soon.
              </p>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "text-white"
                      : "bg-zinc-100 text-zinc-900"
                  }`}
                  style={
                    message.role === "user"
                      ? { backgroundColor: accentColor }
                      : undefined
                  }
                >
                  {message.role === "assistant" ? (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => (
                          <p className="mb-2 last:mb-0">{children}</p>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold">{children}</strong>
                        ),
                        ul: ({ children }) => (
                          <ul className="mb-2 list-disc pl-4 last:mb-0">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="mb-2 list-decimal pl-4 last:mb-0">{children}</ol>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            ))}

            {leadSaved && (
              <div
                role="status"
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  smsSent === false
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
                }`}
              >
                {smsSent === false ? (
                  <>
                    You&apos;re all set — our team has your info and will follow
                    up soon.
                    {notificationNote ? ` (${notificationNote})` : ""}
                  </>
                ) : notificationNote ? (
                  notificationNote
                ) : (
                  <>
                    You&apos;re all set! Our team will reach out within 24 hours to
                    schedule your tour. Questions? Call {publicPhone}.
                  </>
                )}
              </div>
            )}

            {isLoading && (
              <div className="text-sm text-zinc-500" role="status" aria-live="polite">
                Assistant is typing...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-zinc-100 px-4 py-3">
            {!inLeadFlow && !leadSaved && (
              <div className="mb-3 flex flex-wrap gap-2">
                {quickStarts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      if (!isLoading) {
                        sendMessage(prompt);
                      }
                    }}
                    disabled={isLoading}
                    className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                sendMessage(input);
              }}
              className="flex gap-2"
            >
              <input
                ref={inputRef}
                type={inputType}
                inputMode={leadField === "phone" ? "tel" : leadField === "email" ? "email" : "text"}
                autoComplete={
                  leadField === "phone"
                    ? "tel"
                    : leadField === "name"
                      ? "name"
                      : leadField === "email"
                        ? "email"
                        : "off"
                }
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  leadField === "phone"
                    ? "Your phone number"
                    : leadField === "name"
                      ? "Your full name"
                      : leadField === "email"
                        ? "Your email address"
                        : leadField === "goals"
                          ? "What you need help with"
                          : "Ask a question..."
                }
                className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-zinc-300"
                disabled={isLoading}
                aria-label="Chat message"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: accentColor }}
              >
                Send
              </button>
            </form>
            {inLeadFlow && (
              <p className="mt-2 text-[11px] text-zinc-500">
                By submitting, you agree to be contacted by {gymName} about your inquiry. Reply STOP to opt out.
              </p>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-14 w-14 items-center justify-center rounded-full text-sm font-semibold text-white shadow-lg transition hover:scale-105"
        style={{ backgroundColor: accentColor }}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        aria-expanded={isOpen}
      >
        {isOpen ? "×" : "Chat"}
      </button>
    </div>
  );
}
