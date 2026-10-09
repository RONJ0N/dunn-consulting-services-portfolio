import "dotenv/config";
import { detectSearchIntent } from "../lib/rag/query-builder";
import { searchGymKnowledge } from "../lib/rag/search";

const GYM_ID = "dunn-consulting";

const TESTS: Array<{ query: string; expectedCategory: string }> = [
  { query: "how much does a website cost", expectedCategory: "policies" },
  { query: "what are your prices", expectedCategory: "policies" },
  { query: "do you build websites for local businesses", expectedCategory: "services" },
  { query: "tell me about your ai chatbot", expectedCategory: "services" },
  { query: "what is this chat widget on your site", expectedCategory: "services" },
  { query: "how do you capture leads and notify the owner", expectedCategory: "contact" },
  { query: "free audit video walkthrough", expectedCategory: "contact" },
  { query: "two week pilot missed call", expectedCategory: "contact" },
  { query: "what email can I reach you at", expectedCategory: "contact" },
  { query: "how do I stop receiving texts", expectedCategory: "policies" },
  { query: "reply HELP for sms support", expectedCategory: "policies" },
  { query: "is consent required to buy services", expectedCategory: "policies" },
];

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(1);
  }

  let passed = 0;

  console.log(`Dunn Consulting RAG eval (single-turn) — gym: ${GYM_ID}\n`);

  for (const test of TESTS) {
    const results = await searchGymKnowledge(GYM_ID, test.query, 3);
    const topCategories = results.map((result) => result.category);
    const hit = topCategories.includes(test.expectedCategory);
    const intent = detectSearchIntent(test.query);

    if (hit) {
      passed += 1;
    }

    console.log(`${hit ? "PASS" : "FAIL"} | "${test.query}"`);
    console.log(`  expected: ${test.expectedCategory} | intent: ${intent}`);
    console.log(
      `  top3: ${results
        .map((result) => `${result.category}(${result.score.toFixed(2)})`)
        .join(", ")}`,
    );
    console.log("");
  }

  const threshold = Math.ceil(TESTS.length * 0.85);
  console.log(`Score: ${passed}/${TESTS.length} (need ≥ ${threshold})`);

  if (passed < threshold) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
