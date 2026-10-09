import "dotenv/config";
import { getGymFaqChunks } from "../lib/gym/config";
import { searchGymKnowledgeFromMessages } from "../lib/rag/search";

type ChatMessage = { role: "user" | "assistant"; content: string };

type ConversationTest = {
  name: string;
  messages: ChatMessage[];
  requireCategories: string[];
  forbidCategories?: string[];
  requireChunkIds?: string[];
  forbidChunkIds?: string[];
  expectDeferral?: boolean;
  maxResults?: number;
};

const GYM_ID = "dunn-consulting";

function faqIdsForCategory(category: string): string[] {
  return getGymFaqChunks(GYM_ID)
    .filter((chunk) => chunk.category === category)
    .map((chunk) => chunk.id);
}

function missingIds(expected: string[], actual: Set<string>): string[] {
  return expected.filter((id) => !actual.has(id));
}

const CONVERSATION_TESTS: ConversationTest[] = [
  {
    name: "greeting only — no bulk injection",
    messages: [{ role: "user", content: "Hi" }],
    requireCategories: [],
    maxResults: 2,
  },
  {
    name: "services overview",
    messages: [
      {
        role: "user",
        content: "What AI automation services does Dunn Consulting offer?",
      },
    ],
    requireCategories: ["sales"],
    requireChunkIds: ["missed-call-text-back", "growth-package-launch"],
  },
  {
    name: "pricing follow-up after audit mention",
    messages: [
      { role: "user", content: "Tell me about the AI Opportunity Audit" },
      {
        role: "assistant",
        content:
          "The AI Opportunity Audit maps workflows and ranks automations by ROI.",
      },
      { role: "user", content: "How much does it cost?" },
    ],
    requireCategories: ["sales"],
    requireChunkIds: ["ai-opportunity-audit"],
    forbidCategories: ["policies", "contact"],
  },
  {
    name: "fixed-scope vs care plan comparison",
    messages: [
      {
        role: "user",
        content: "What's the difference between a fixed-scope build and the care plan?",
      },
    ],
    requireCategories: ["sales"],
    requireChunkIds: ["fixed-scope-build", "care-plan"],
  },
  {
    name: "free pilot details",
    messages: [{ role: "user", content: "Do you offer a free pilot?" }],
    requireCategories: [],
    requireChunkIds: ["two-week-pilot"],
  },
  {
    name: "free audit CTA",
    messages: [
      {
        role: "user",
        content: "I'd like to book a free audit of my website and phone setup",
      },
    ],
    requireCategories: [],
    requireChunkIds: ["free-audit"],
  },
  {
    name: "contact email",
    messages: [{ role: "user", content: "What's the best email to reach you?" }],
    requireCategories: ["contact"],
    requireChunkIds: ["contact-email"],
    forbidCategories: ["policies"],
  },
  {
    name: "SMS opt-out policy",
    messages: [{ role: "user", content: "How do I unsubscribe from your texts?" }],
    requireCategories: ["policies"],
    requireChunkIds: ["sms-opt-out"],
    forbidCategories: ["sales"],
  },
  {
    name: "SMS help keyword",
    messages: [{ role: "user", content: "I replied HELP — who do I contact?" }],
    requireCategories: ["policies"],
    requireChunkIds: ["sms-help"],
  },
  {
    name: "missed-call text-back after services rundown",
    messages: [
      {
        role: "user",
        content: "Give me an overview of your automation packages and pricing",
      },
      { role: "assistant", content: "We offer audits, builds, and care plans..." },
      { role: "user", content: "How quickly can missed-call text-back go live?" },
    ],
    requireCategories: ["sales"],
    requireChunkIds: ["missed-call-text-back"],
    forbidChunkIds: ["sms-opt-out", "sms-help"],
  },
  {
    name: "out-of-scope legal advice",
    messages: [
      {
        role: "user",
        content:
          "A competitor copied my website copy. Can you tell me if I have a lawsuit?",
      },
    ],
    requireCategories: [],
    expectDeferral: true,
    forbidCategories: ["sales", "contact"],
  },
  {
    name: "off-topic weather",
    messages: [{ role: "user", content: "What's the weather in Atlanta today?" }],
    requireCategories: [],
    expectDeferral: true,
    forbidCategories: ["sales", "contact", "policies"],
    maxResults: 2,
  },
];

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(1);
  }

  let passed = 0;

  console.log(`Dunn Consulting RAG conversation eval — gym: ${GYM_ID}\n`);

  for (const test of CONVERSATION_TESTS) {
    const {
      results,
      lowConfidence,
      deferToFrontDesk,
      fullDump,
      injectedCategories,
    } = await searchGymKnowledgeFromMessages(GYM_ID, test.messages);
    const resultIds = new Set(results.map((result) => result.id));
    const resultCategories = new Set(results.map((result) => result.category));
    const failures: string[] = [];

    for (const category of test.requireCategories) {
      const expectedIds = faqIdsForCategory(category);
      const missing = missingIds(expectedIds, resultIds);
      if (missing.length > 0) {
        failures.push(
          `missing all ${category} chunks: ${missing.join(", ")}`,
        );
      }
    }

    for (const category of test.forbidCategories ?? []) {
      if (resultCategories.has(category)) {
        failures.push(`unexpected category injected: ${category}`);
      }
    }

    for (const chunkId of test.requireChunkIds ?? []) {
      if (!resultIds.has(chunkId)) {
        failures.push(`missing required chunk: ${chunkId}`);
      }
    }

    for (const chunkId of test.forbidChunkIds ?? []) {
      if (resultIds.has(chunkId)) {
        failures.push(`forbidden chunk present: ${chunkId}`);
      }
    }

    if (test.expectDeferral === true && !deferToFrontDesk) {
      failures.push("expected deferToFrontDesk=true, got false");
    }
    if (test.expectDeferral === false && deferToFrontDesk) {
      failures.push("expected deferToFrontDesk=false, got true");
    }

    if (typeof test.maxResults === "number" && results.length > test.maxResults) {
      failures.push(
        `expected at most ${test.maxResults} chunks, got ${results.length}`,
      );
    }

    const ok = failures.length === 0;

    if (ok) {
      passed += 1;
    }

    console.log(`${ok ? "PASS" : "FAIL"} | ${test.name}`);
    console.log(
      `  low confidence: ${lowConfidence} | defer: ${deferToFrontDesk} | fullDump: ${fullDump}`,
    );
    console.log(
      `  injected categories: ${injectedCategories.join(", ") || "(none)"}`,
    );
    console.log(`  chunks (${results.length}): ${results.map((r) => r.id).join(", ")}`);

    if (!ok) {
      for (const failure of failures) {
        console.log(`  - ${failure}`);
      }
    }

    console.log("");
  }

  const threshold = Math.ceil(CONVERSATION_TESTS.length * 0.85);
  console.log(`Score: ${passed}/${CONVERSATION_TESTS.length} (need ≥ ${threshold})`);

  if (passed < threshold) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
