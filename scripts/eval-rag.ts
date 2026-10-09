import "dotenv/config";
import { detectSearchIntent } from "../lib/rag/query-builder";
import { searchGymKnowledge } from "../lib/rag/search";

const TESTS: Array<{ query: string; expectedCategory: string }> = [
  { query: "hours on sunday", expectedCategory: "hours" },
  { query: "what time do you close on weekdays", expectedCategory: "hours" },
  { query: "cheapest membership", expectedCategory: "membership" },
  { query: "how much is basic membership", expectedCategory: "membership" },
  { query: "cancel membership", expectedCategory: "membership" },
  { query: "yoga classes", expectedCategory: "classes" },
  { query: "spin class schedule", expectedCategory: "classes" },
  { query: "what classes do you have", expectedCategory: "classes" },
  { query: "personal training cost", expectedCategory: "personal_training" },
  { query: "how much is a trainer", expectedCategory: "personal_training" },
  { query: "free day pass", expectedCategory: "sales" },
  { query: "book a tour", expectedCategory: "sales" },
  { query: "student discount", expectedCategory: "membership" },
  { query: "parking at night", expectedCategory: "location" },
  { query: "guest policy", expectedCategory: "policies" },
];

async function main() {
  const gymId = process.argv[2] ?? "demo-gym";

  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(1);
  }

  let passed = 0;

  console.log(`RAG eval for gym: ${gymId}\n`);

  for (const test of TESTS) {
    const results = await searchGymKnowledge(gymId, test.query, 3);
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

  console.log(`Score: ${passed}/${TESTS.length}`);

  if (passed < 13) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
