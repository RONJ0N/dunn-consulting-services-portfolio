import "dotenv/config";
import { getGymConfig, getGymFaqChunks } from "../lib/gym/config";
import { embedTexts, saveEmbeddings } from "../lib/rag/embed";

async function main() {
  const gymId = process.argv[2] ?? "demo-gym";

  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "Missing OPENAI_API_KEY. Copy .env.example to .env and add your key.",
    );
    process.exit(1);
  }

  const config = getGymConfig(gymId);
  const allowedCategoryIds = new Set(config.categories.map((c) => c.id));
  const chunks = getGymFaqChunks(gymId);

  if (chunks.length === 0) {
    console.error(`No FAQ chunks found for "${gymId}". Run ingestion first.`);
    process.exit(1);
  }

  const invalidChunks = chunks.filter(
    (chunk) => !allowedCategoryIds.has(chunk.category),
  );

  if (invalidChunks.length > 0) {
    console.error(
      `\n✗ Found ${invalidChunks.length} chunk(s) with categories not declared in config.json:`,
    );
    for (const chunk of invalidChunks) {
      console.error(`  - ${chunk.id} → category "${chunk.category}"`);
    }
    console.error(
      `\nDeclared categories: ${Array.from(allowedCategoryIds).join(", ")}`,
    );
    console.error(
      "Either fix the chunk categories or add the missing category in config.json.",
    );
    process.exit(1);
  }

  console.log(
    `Embedding ${chunks.length} chunks for "${config.name}" (gym id: ${gymId})...`,
  );

  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));
  const records = chunks.map((chunk, index) => ({
    id: chunk.id,
    category: chunk.category,
    content: chunk.content,
    embedding: embeddings[index],
  }));

  saveEmbeddings(gymId, records);
  console.log(
    `\n✓ Saved ${records.length} embeddings to data/gyms/${gymId}/embeddings.json`,
  );

  // Also push config + embeddings to the database so the deployed app can
  // serve this tenant without a redeploy. Point DATABASE_URL (and
  // DATABASE_DRIVER=postgres) at Supabase to onboard against production.
  try {
    const { saveEmbeddingsToDb } = await import("../lib/gym/db-config");
    const { loadTenantConfig, saveAdminKnowledgeConfig } = await import(
      "../lib/gym/tenant-config"
    );

    // Sync FAQ embeddings always. Sync knowledge config from disk but preserve
    // widget branding already saved in Neon (agency admin edits).
    try {
      const existing = await loadTenantConfig(gymId);
      await saveAdminKnowledgeConfig(gymId, {
        tone: config.tone,
        tagline: config.tagline,
        websiteUrl: config.websiteUrl,
        contactEmail: config.contactEmail,
        ownerEmail: config.ownerEmail ?? existing.ownerEmail,
        chat: config.chat,
        categories: config.categories,
      });
    } catch {
      const { upsertGymConfig } = await import("../lib/gym/db-config");
      await upsertGymConfig(gymId, config);
    }

    await saveEmbeddingsToDb(gymId, records);
    console.log(`✓ Synced config + ${records.length} chunks to the database`);
  } catch (error) {
    console.warn(
      "⚠ Database sync skipped (set DATABASE_URL to enable):",
      error instanceof Error ? error.message : error,
    );
  }
}

main().catch((error) => {
  console.error("\n✗ Seed failed:", error);
  process.exit(1);
});
