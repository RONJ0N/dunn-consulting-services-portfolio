import "dotenv/config";
import { eq } from "drizzle-orm";
import { classifyLeadCaptureAction } from "../lib/chat/lead-classifier";
import {
  advanceLeadSession,
  replayLeadFieldsFromUserMessages,
} from "../lib/chat/lead-session";
import { isValidGoals, isValidName } from "../lib/chat/lead-validation";
import { getGymConfig } from "../lib/gym/config";
import { getLeadCaptureSettings } from "../lib/gym/lead-capture-config";
import { db } from "../lib/db/client";
import { chatSessions, type ChatSession } from "../lib/db/schema";

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  const now = new Date();
  return {
    id: "test-session",
    gymId: "demo-gym",
    leadName: null,
    leadPhone: null,
    leadEmail: null,
    leadGoals: null,
    leadStatus: "idle",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Ensures a chat_sessions row exists with the desired starting state.
 * Tests that call advanceLeadSession with a state transition (start/reset
 * or moving between collecting_* statuses) trigger an UPDATE + SELECT
 * inside lib/chat/lead-session, so the row must really be in SQLite.
 */
async function ensureSessionRow(
  id: string,
  overrides: Partial<ChatSession> = {},
): Promise<ChatSession> {
  const base = makeSession({ id, ...overrides });
  const existing = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, id))
    .limit(1);

  if (existing[0]) {
    const now = new Date();
    await db
      .update(chatSessions)
      .set({
        leadName: base.leadName,
        leadPhone: base.leadPhone,
        leadGoals: base.leadGoals,
        leadStatus: base.leadStatus,
        updatedAt: now,
      })
      .where(eq(chatSessions.id, id));
    const rows = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, id))
      .limit(1);
    return rows[0];
  }

  await db.insert(chatSessions).values(base);
  return base;
}

const tourMessages = [
  { role: "assistant" as const, content: "Welcome!" },
  { role: "user" as const, content: "Book a tour" },
  { role: "assistant" as const, content: "What is your name?" },
  { role: "user" as const, content: "Redt Dunn" },
  { role: "assistant" as const, content: "Phone number?" },
  { role: "user" as const, content: "2025550147" },
  {
    role: "assistant" as const,
    content: "What are your fitness goals or membership tier?",
  },
];

interface CaseResult {
  label: string;
  passed: boolean;
  detail?: string;
}

const results: CaseResult[] = [];

function record(label: string, passed: boolean, detail?: string) {
  results.push({ label, passed, detail });
  if (passed) {
    console.log(`PASS | ${label}`);
  } else {
    console.log(`FAIL | ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function runTests() {
  const demoLeadSettings = getLeadCaptureSettings(getGymConfig("demo-gym"));
  console.log("Lead capture edge-case eval\n");

  // ----- Original regression cases -----

  const softMembershipInterest = await classifyLeadCaptureAction(
    [{ role: "user", content: "I am interested in the plus membership" }],
    "idle",
  );
  record(
    "membership preference alone does not start capture",
    softMembershipInterest.action === "none",
    `action=${softMembershipInterest.action}`,
  );

  const membershipQuestion = await classifyLeadCaptureAction(
    [
      ...tourMessages,
      { role: "user", content: "which membership should I get?" },
    ],
    "collecting_goals",
  );
  record(
    "membership recommendation during goals stays in capture",
    membershipQuestion.action === "none",
    `action=${membershipQuestion.action}`,
  );

  record(
    "membership recommendation is not stored as goals",
    !isValidGoals("which membership should I get?"),
  );

  const replay = replayLeadFieldsFromUserMessages([
    ...tourMessages,
    { role: "user", content: "I am interested in the plus membership" },
  ]);
  record(
    "tour history replays name and phone for resume",
    replay.leadName === "Redt Dunn" &&
      replay.leadPhone === "2025550147" &&
      replay.status === "collecting_goals",
    JSON.stringify(replay),
  );

  const yesSession = makeSession({
    leadStatus: "collecting_goals",
    leadName: "Redt Dunn",
    leadPhone: "2025550147",
    leadGoals: "I am interested in the plus membership",
  });
  const yesResult = await advanceLeadSession(yesSession, "yes", "none", demoLeadSettings);
  record(
    "yes uses prior membership preference as goals",
    yesResult.completedLead?.goals === "I am interested in the plus membership",
    JSON.stringify(yesResult.completedLead),
  );

  // ----- Stress / edge-case scenarios -----

  // 1. "yes" mid-conversation without any commitment offer.
  const bareYesCls = await classifyLeadCaptureAction(
    [
      { role: "assistant", content: "Our hours are 5am-11pm daily." },
      { role: "user", content: "yes" },
    ],
    "idle",
  );
  record(
    "bare 'yes' with no prior commitment offer does NOT start capture",
    bareYesCls.action === "none",
    `action=${bareYesCls.action} reason=${bareYesCls.reason}`,
  );

  // 2. Explicit callback opt-in.
  const callbackSession = await ensureSessionRow("stress-callback");
  const callbackCls = await classifyLeadCaptureAction(
    [{ role: "user", content: "can you call me back?" }],
    "idle",
  );
  record(
    "callback opt-in -> classifier action=start",
    callbackCls.action === "start",
    `action=${callbackCls.action} reason=${callbackCls.reason}`,
  );
  if (callbackCls.action === "start") {
    const advanced = await advanceLeadSession(
      callbackSession,
      "can you call me back?",
      "start",
      demoLeadSettings,
    );
    record(
      "callback opt-in -> capture starts at collecting_name with callback hint",
      advanced.session.leadStatus === "collecting_name" &&
        advanced.session.leadGoals === "[Requested callback]",
      `status=${advanced.session.leadStatus} goals=${advanced.session.leadGoals}`,
    );
  } else {
    record(
      "callback opt-in -> capture starts at collecting_name with callback hint",
      false,
      "skipped because classifier did not start",
    );
  }

  // 3. Explicit day-pass opt-in.
  const daypassSession = await ensureSessionRow("stress-daypass");
  const daypassCls = await classifyLeadCaptureAction(
    [{ role: "user", content: "I want a free day pass" }],
    "idle",
  );
  record(
    "day pass opt-in -> classifier action=start",
    daypassCls.action === "start",
    `action=${daypassCls.action} reason=${daypassCls.reason}`,
  );
  if (daypassCls.action === "start") {
    const advanced = await advanceLeadSession(
      daypassSession,
      "I want a free day pass",
      "start",
      demoLeadSettings,
    );
    record(
      "day pass opt-in -> capture starts with day-pass hint",
      advanced.session.leadStatus === "collecting_name" &&
        advanced.session.leadGoals === "[Wants free day pass / trial]",
      `status=${advanced.session.leadStatus} goals=${advanced.session.leadGoals}`,
    );
  } else {
    record(
      "day pass opt-in -> capture starts with day-pass hint",
      false,
      "skipped because classifier did not start",
    );
  }

  // 4. Explicit signup opt-in.
  const signupSession = await ensureSessionRow("stress-signup");
  const signupCls = await classifyLeadCaptureAction(
    [{ role: "user", content: "sign me up" }],
    "idle",
  );
  record(
    "signup opt-in -> classifier action=start",
    signupCls.action === "start",
    `action=${signupCls.action} reason=${signupCls.reason}`,
  );
  if (signupCls.action === "start") {
    const advanced = await advanceLeadSession(
      signupSession,
      "sign me up",
      "start",
      demoLeadSettings,
    );
    record(
      "signup opt-in -> capture starts with sign-up hint",
      advanced.session.leadStatus === "collecting_name" &&
        advanced.session.leadGoals === "[Wants to sign up]",
      `status=${advanced.session.leadStatus} goals=${advanced.session.leadGoals}`,
    );
  } else {
    record(
      "signup opt-in -> capture starts with sign-up hint",
      false,
      "skipped because classifier did not start",
    );
  }

  // 5. Garbage name "give me a full rundown" after a tour request.
  record(
    "isValidName rejects 'give me a full rundown'",
    !isValidName("give me a full rundown"),
  );
  const garbageNameSession = await ensureSessionRow("stress-garbage-name", {
    leadStatus: "collecting_name",
    leadGoals: "[Wants to book a tour]",
  });
  const garbageResult = await advanceLeadSession(
    garbageNameSession,
    "give me a full rundown",
    "none",
    demoLeadSettings,
  );
  record(
    "garbage name input -> advance returns nameInvalid, status unchanged",
    garbageResult.nameInvalid === true &&
      garbageResult.session.leadStatus === "collecting_name" &&
      garbageResult.session.leadName === null,
    `nameInvalid=${garbageResult.nameInvalid} status=${garbageResult.session.leadStatus} name=${garbageResult.session.leadName}`,
  );

  // 6. Long paragraph as name.
  const longName =
    "My name is Redt Dunn and I'm super excited to start working out at your gym this week";
  record("isValidName rejects a long paragraph", !isValidName(longName));

  // 7. Email pasted as name.
  record(
    "isValidName rejects an email address",
    !isValidName("redt@example.com"),
  );
  const emailNameSession = await ensureSessionRow("stress-email-name", {
    leadStatus: "collecting_name",
    leadGoals: "[Wants to book a tour]",
  });
  const emailNameResult = await advanceLeadSession(
    emailNameSession,
    "redt@example.com",
    "none",
    demoLeadSettings,
  );
  record(
    "email as name -> advance returns nameInvalid, name not stored",
    emailNameResult.nameInvalid === true &&
      emailNameResult.session.leadName === null,
    `nameInvalid=${emailNameResult.nameInvalid} name=${emailNameResult.session.leadName}`,
  );

  // 8. "skip" / "I don't want to" mid-capture should gracefully exit.
  const skipCls = await classifyLeadCaptureAction(
    [
      { role: "assistant", content: "What is your full name?" },
      { role: "user", content: "skip" },
    ],
    "collecting_name",
  );
  record(
    "'skip' mid-capture -> classifier action=reset (graceful exit)",
    skipCls.action === "reset",
    `action=${skipCls.action} reason=${skipCls.reason}`,
  );
  const declineCls = await classifyLeadCaptureAction(
    [
      { role: "assistant", content: "What is your full name?" },
      { role: "user", content: "I don't want to" },
    ],
    "collecting_name",
  );
  record(
    "'I don't want to' mid-capture -> classifier action=reset (graceful exit)",
    declineCls.action === "reset",
    `action=${declineCls.action} reason=${declineCls.reason}`,
  );

  // 9. 4-digit pin as phone.
  const pinSession = await ensureSessionRow("stress-pin-phone", {
    leadStatus: "collecting_phone",
    leadName: "Test User",
    leadGoals: "[Wants to book a tour]",
  });
  const pinResult = await advanceLeadSession(pinSession, "1234", "none", demoLeadSettings);
  record(
    "4-digit pin -> advance returns phoneInvalid, status unchanged",
    pinResult.phoneInvalid === true &&
      pinResult.session.leadStatus === "collecting_phone" &&
      pinResult.session.leadPhone === null,
    `phoneInvalid=${pinResult.phoneInvalid} status=${pinResult.session.leadStatus} phone=${pinResult.session.leadPhone}`,
  );

  // 10. User provides name, then bails with "actually nevermind".
  const nevermindSession = await ensureSessionRow("stress-nevermind", {
    leadStatus: "collecting_phone",
    leadName: "Redt Dunn",
    leadGoals: "[Wants to book a tour]",
  });
  const nevermindCls = await classifyLeadCaptureAction(
    [
      { role: "assistant", content: "What is your full name?" },
      { role: "user", content: "Redt Dunn" },
      { role: "assistant", content: "What is your phone number?" },
      { role: "user", content: "actually nevermind" },
    ],
    "collecting_phone",
  );
  record(
    "'actually nevermind' mid-capture -> classifier action=reset",
    nevermindCls.action === "reset",
    `action=${nevermindCls.action} reason=${nevermindCls.reason}`,
  );
  if (nevermindCls.action === "reset") {
    const advanced = await advanceLeadSession(
      nevermindSession,
      "actually nevermind",
    "reset",
    demoLeadSettings,
  );
    record(
      "reset action wipes name/phone/goals and returns status=idle",
      advanced.session.leadStatus === "idle" &&
        advanced.session.leadName === null &&
        advanced.session.leadPhone === null &&
        advanced.session.leadGoals === null,
      JSON.stringify({
        status: advanced.session.leadStatus,
        name: advanced.session.leadName,
        phone: advanced.session.leadPhone,
        goals: advanced.session.leadGoals,
      }),
    );
  } else {
    record(
      "reset action wipes name/phone/goals and returns status=idle",
      false,
      "skipped because classifier did not reset",
    );
  }

  // 11. Email pasted as the goal.
  record(
    "isValidGoals rejects bare email address",
    !isValidGoals("redt@example.com"),
  );
  const emailGoalSession = await ensureSessionRow("stress-email-goal", {
    leadStatus: "collecting_goals",
    leadName: "Redt Dunn",
    leadPhone: "2025550147",
    leadGoals: "[Wants to book a tour]",
  });
  const emailGoalResult = await advanceLeadSession(
    emailGoalSession,
    "redt@example.com",
    "none",
    demoLeadSettings,
  );
  record(
    "email as goal -> advance returns goalsInvalid, no completedLead",
    emailGoalResult.goalsInvalid === true &&
      emailGoalResult.completedLead === null,
    `goalsInvalid=${emailGoalResult.goalsInvalid} completedLead=${JSON.stringify(emailGoalResult.completedLead)}`,
  );

  // 12. FAQ question mid-capture should NOT reset; bot answers and stays.
  const faqCls = await classifyLeadCaptureAction(
    [
      { role: "assistant", content: "What is your full name?" },
      { role: "user", content: "Redt Dunn" },
      { role: "assistant", content: "What is your phone number?" },
      { role: "user", content: "what are your hours?" },
    ],
    "collecting_phone",
  );
  record(
    "FAQ question mid-capture -> classifier action=none (continue capture)",
    faqCls.action === "none",
    `action=${faqCls.action} reason=${faqCls.reason}`,
  );

  // ----- Summary -----
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`\nScore: ${passed}/${total}`);

  if (passed < total) {
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
