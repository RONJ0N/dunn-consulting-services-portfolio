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
  expectFullDump?: boolean;
  /**
   * Optional cap on the number of chunks returned. Useful for adversarial /
   * off-topic queries where we want to confirm the retriever does not bulk
   * inject context for nonsense input.
   */
  maxResults?: number;
};

function faqIdsForCategory(gymId: string, category: string): string[] {
  return getGymFaqChunks(gymId)
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
  },
  {
    name: "R6 — overall rundown phrase",
    messages: [
      { role: "user", content: "Hey can you give me an overall rundown of your gym?" },
    ],
    requireCategories: ["membership", "classes", "personal_training", "equipment"],
  },
  {
    name: "R6 — give me the rundown",
    messages: [{ role: "user", content: "give me the rundown" }],
    requireCategories: ["membership", "classes", "personal_training", "equipment"],
  },
  {
    name: "R7 — do you have personal trainers?",
    messages: [{ role: "user", content: "do you have personal trainers?" }],
    requireCategories: ["personal_training"],
    requireChunkIds: ["pt-rates", "pt-availability"],
  },
  {
    name: "R7 — alt phrasing: any 1-on-1 coaching available?",
    messages: [{ role: "user", content: "any 1-on-1 coaching available?" }],
    requireCategories: ["personal_training"],
  },
  {
    name: "R8 — PT cost follow-up (extra or included)",
    messages: [
      { role: "user", content: "do you have personal trainers?" },
      {
        role: "assistant",
        content: "Yes! Trainers are available...",
      },
      {
        role: "user",
        content: "do they cost extra or come with my membership?",
      },
    ],
    requireCategories: ["personal_training", "membership"],
    requireChunkIds: ["pt-rates", "membership-premium"],
  },
  {
    name: "R9 — PT question after classes/rundown (pollution test)",
    messages: [
      {
        role: "user",
        content: "Yes give me a full run down of what the gym offers and membership plans",
      },
      { role: "assistant", content: "Here's the rundown..." },
      { role: "user", content: "what kind of classes do you have?" },
      { role: "assistant", content: "We offer yoga, spin, HIIT, strength..." },
      { role: "user", content: "do you have personal trainers?" },
    ],
    requireCategories: ["personal_training"],
    requireChunkIds: ["pt-rates", "pt-availability"],
    forbidChunkIds: ["class-spin", "class-hiit"],
  },
  {
    name: "general gym info request",
    messages: [
      { role: "user", content: "Hey can you give me some info about the gym?" },
    ],
    requireCategories: ["membership", "classes", "personal_training", "equipment"],
  },
  {
    name: "which membership should I get",
    messages: [{ role: "user", content: "which membership should I get?" }],
    requireCategories: ["membership"],
    requireChunkIds: [
      "membership-basic",
      "membership-plus",
      "membership-premium",
    ],
  },
  {
    name: "full gym rundown with membership plans",
    messages: [
      {
        role: "user",
        content:
          "Yes give me a full run down of what the gym offers and membership plans",
      },
    ],
    requireCategories: ["membership", "classes", "personal_training", "equipment"],
  },
  {
    name: "what services does the gym offer",
    messages: [{ role: "user", content: "what services does the gym offer?" }],
    requireCategories: ["membership", "classes", "personal_training", "equipment"],
  },
  {
    name: "what kind of classes (membership pollution in history)",
    messages: [
      {
        role: "user",
        content:
          "Yes give me a full run down of what the gym offers and membership plans",
      },
      { role: "assistant", content: "membership breakdown..." },
      { role: "user", content: "what services does the gym offer?" },
      { role: "assistant", content: "services..." },
      { role: "user", content: "what kind of classes do you have?" },
    ],
    requireCategories: ["classes"],
    forbidCategories: ["membership"],
    requireChunkIds: [
      "class-yoga-mon",
      "class-yoga-wed",
      "class-spin",
      "class-hiit",
      "class-strength",
    ],
  },
  {
    name: "class time follow-up with pronoun",
    messages: [
      { role: "user", content: "what kind of classes do you have?" },
      {
        role: "assistant",
        content: "We offer yoga, spin, HIIT, and strength training.",
      },
      { role: "user", content: "what time are they offered at?" },
    ],
    requireCategories: ["classes"],
    requireChunkIds: ["class-spin", "class-strength", "class-hiit"],
  },
  {
    name: "yoga hiit strength class hours",
    messages: [
      {
        role: "user",
        content:
          "what are the hours of the yoga, hiit and strength training classes?",
      },
    ],
    requireCategories: ["classes"],
    requireChunkIds: ["class-strength", "class-yoga-wed", "class-hiit"],
    forbidChunkIds: ["hours-weekday"],
  },
  {
    name: "do you have any other classes",
    messages: [{ role: "user", content: "do you have any other classes?" }],
    requireCategories: ["classes"],
    requireChunkIds: ["class-spin", "class-strength"],
  },
  {
    name: "broad membership pricing",
    messages: [{ role: "user", content: "what membership options do you have?" }],
    requireCategories: ["membership"],
    requireChunkIds: [
      "membership-basic",
      "membership-plus",
      "membership-premium",
    ],
  },
  {
    name: "general staffed hours",
    messages: [{ role: "user", content: "what are your hours?" }],
    requireCategories: ["hours"],
    requireChunkIds: ["hours-weekday"],
  },

  // ===========================================================================
  // ADVERSARIAL SCENARIOS — stress-test pronoun resolution, negation, topic
  // switching, out-of-scope handling, off-topic chitchat, ambiguity, and
  // dense multi-question paragraphs. These are intended to surface RAG bugs
  // (query pollution, over-eager category injection, missed deferrals).
  // ===========================================================================

  {
    name: "ADV1 — pronoun 'how much is it' after premium discussed",
    messages: [
      { role: "user", content: "tell me about premium membership" },
      {
        role: "assistant",
        content:
          "Premium Membership is $79/month and includes 2 personal training sessions, sauna access, and 2 guest passes.",
      },
      { role: "user", content: "how much is it?" },
    ],
    requireCategories: ["membership"],
    requireChunkIds: ["membership-premium"],
    forbidCategories: ["personal_training", "classes", "hours"],
  },

  {
    name: "ADV2 — pronoun 'what about that one' after yoga listing",
    messages: [
      { role: "user", content: "what classes do you have?" },
      {
        role: "assistant",
        content:
          "We offer Power Yoga, Gentle Flow Yoga, Spin, HIIT Burn, and Barbell Strength.",
      },
      { role: "user", content: "what about that one — yoga?" },
    ],
    requireCategories: ["classes"],
    requireChunkIds: ["class-yoga-mon", "class-yoga-wed"],
    forbidCategories: ["membership", "hours", "personal_training"],
  },

  {
    name: "ADV3 — negation 'I don't want a tour, just classes'",
    messages: [
      {
        role: "user",
        content:
          "I don't want a tour, can you just tell me what classes you offer?",
      },
    ],
    requireCategories: ["classes"],
    forbidCategories: ["sales"],
  },

  {
    name: "ADV4 — negation 'NOT interested in classes, what memberships?'",
    messages: [
      {
        role: "user",
        content:
          "I'm NOT interested in classes. What membership options do you have?",
      },
    ],
    requireCategories: ["membership"],
    forbidCategories: ["classes"],
  },

  {
    name: "ADV5 — topic switch (classes → hours → PT, last turn PT)",
    messages: [
      { role: "user", content: "what classes do you have?" },
      { role: "assistant", content: "We offer yoga, spin, HIIT, strength..." },
      { role: "user", content: "what are your hours?" },
      {
        role: "assistant",
        content:
          "Front desk is staffed Mon-Fri 5 AM – 10 PM, Sat 6 AM – 8 PM, Sun 7 AM – 6 PM.",
      },
      { role: "user", content: "ok and do you have personal trainers?" },
    ],
    requireCategories: ["personal_training"],
    requireChunkIds: ["pt-rates", "pt-availability"],
    forbidCategories: ["classes", "hours"],
  },

  {
    name: "ADV6 — comparison 'how is plus different from basic?'",
    messages: [
      {
        role: "user",
        content: "how is the plus tier different from the basic tier?",
      },
    ],
    requireCategories: ["membership"],
    requireChunkIds: ["membership-basic", "membership-plus"],
  },

  {
    name: "ADV7 — out-of-scope legal advice",
    messages: [
      {
        role: "user",
        content:
          "I slipped on the gym floor last week. Can you give me legal advice on my injury claim?",
      },
    ],
    requireCategories: [],
    expectDeferral: true,
    forbidCategories: ["membership", "classes", "personal_training"],
  },

  {
    name: "ADV8 — out-of-scope medical advice",
    messages: [
      {
        role: "user",
        content:
          "I have a heart condition and high blood pressure. Should I be doing HIIT workouts here?",
      },
    ],
    requireCategories: [],
    expectDeferral: true,
    forbidCategories: ["classes", "personal_training", "membership"],
  },

  {
    name: "ADV9 — out-of-scope competitor pricing",
    messages: [
      {
        role: "user",
        content:
          "How do your prices compare to Planet Fitness and Gold's Gym across town?",
      },
    ],
    requireCategories: ["membership"],
    forbidCategories: ["classes", "personal_training", "hours"],
  },

  {
    name: "ADV10 — out-of-scope nutrition advice",
    messages: [
      {
        role: "user",
        content:
          "What should I eat before and after a workout? Give me a full meal plan.",
      },
    ],
    requireCategories: [],
    expectDeferral: true,
    forbidCategories: ["classes", "personal_training", "membership", "equipment"],
  },

  {
    name: "ADV11 — off-topic chitchat 'what's the weather?'",
    messages: [{ role: "user", content: "what's the weather like today?" }],
    requireCategories: [],
    expectDeferral: true,
    forbidCategories: [
      "membership",
      "classes",
      "personal_training",
      "hours",
      "equipment",
      "sales",
    ],
  },

  {
    name: "ADV12 — off-topic 'tell me a joke'",
    messages: [{ role: "user", content: "tell me a joke" }],
    requireCategories: [],
    expectDeferral: true,
    forbidCategories: [
      "membership",
      "classes",
      "personal_training",
      "hours",
      "equipment",
      "sales",
    ],
  },

  {
    name: "ADV13 — ambiguous time 'when are you open tomorrow?'",
    messages: [{ role: "user", content: "when are you open tomorrow?" }],
    requireCategories: ["hours"],
    requireChunkIds: ["hours-weekday"],
  },

  {
    name: "ADV14 — specific subquery 'which yoga class is on Wednesday?'",
    messages: [
      { role: "user", content: "which yoga class is on Wednesday?" },
    ],
    requireCategories: ["classes"],
    requireChunkIds: ["class-yoga-mon"],
    forbidCategories: ["hours", "membership"],
  },

  {
    name: "ADV15 — long paragraph with many questions",
    messages: [
      {
        role: "user",
        content:
          "Hi there! I'm thinking about joining a gym. Can you tell me about your membership tiers and prices, what group classes you run during the week, whether you have personal trainers and how much they cost, what equipment you have on the gym floor, and what your hours are on weekends? Also, do you have any kind of free trial or day pass I can use before signing up? Thanks!",
      },
    ],
    requireCategories: [
      "membership",
      "classes",
      "personal_training",
      "equipment",
    ],
  },

  {
    name: "ADV16 — bare greeting 'hey hi hello there'",
    messages: [{ role: "user", content: "hey hi hello there" }],
    requireCategories: [],
    forbidCategories: [
      "membership",
      "classes",
      "personal_training",
      "hours",
      "equipment",
      "sales",
      "policies",
    ],
    maxResults: 2,
  },
];

async function main() {
  const gymId = process.argv[2] ?? "demo-gym";

  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(1);
  }

  let passed = 0;

  console.log(`RAG conversation eval for gym: ${gymId}\n`);

  for (const test of CONVERSATION_TESTS) {
    const {
      results,
      lowConfidence,
      deferToFrontDesk,
      fullDump,
      injectedCategories,
    } = await searchGymKnowledgeFromMessages(gymId, test.messages);
    const resultIds = new Set(results.map((result) => result.id));
    const resultCategories = new Set(results.map((result) => result.category));
    const failures: string[] = [];

    for (const category of test.requireCategories) {
      const expectedIds = faqIdsForCategory(gymId, category);
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

    if (test.expectFullDump === true && !fullDump) {
      failures.push("expected fullDump=true, got false");
    }
    if (test.expectFullDump === false && fullDump) {
      failures.push("expected fullDump=false, got true");
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

  console.log(`Score: ${passed}/${CONVERSATION_TESTS.length}`);

  if (passed < CONVERSATION_TESTS.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
