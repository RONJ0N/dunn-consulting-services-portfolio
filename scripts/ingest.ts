import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { getGymConfig, getGymFaqChunks } from "../lib/gym/config";
import { chunkDocumentsWithLLM } from "../lib/ingest/chunker";
import { diffProposedChunks } from "../lib/ingest/dedupe";
import { extractFromDocxFile } from "../lib/ingest/extract-docx";
import { extractFromPdfFile } from "../lib/ingest/extract-pdf";
import { extractFromScheduleFile } from "../lib/ingest/extract-schedule";
import { extractFromUrl } from "../lib/ingest/extract-url";
import { extractFromPastedText } from "../lib/ingest/extract-paste";
import type { ExtractedDocument, ProposedChunk } from "../lib/ingest/types";

interface IngestArgs {
  gymId: string;
  urls: string[];
  pdfs: string[];
  docxs: string[];
  schedules: string[];
  pastes: string[];
  pasteFiles: string[];
  write: boolean;
  dryRun: boolean;
  output?: string;
  diffOnly: boolean;
}

function parseArgs(): IngestArgs {
  const args = process.argv.slice(2);
  const result: IngestArgs = {
    gymId: "",
    urls: [],
    pdfs: [],
    docxs: [],
    schedules: [],
    pastes: [],
    pasteFiles: [],
    write: false,
    dryRun: false,
    diffOnly: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--gym":
        result.gymId = args[++i];
        break;
      case "--url":
        result.urls.push(args[++i]);
        break;
      case "--pdf":
        result.pdfs.push(args[++i]);
        break;
      case "--docx":
        result.docxs.push(args[++i]);
        break;
      case "--schedule":
        result.schedules.push(args[++i]);
        break;
      case "--paste":
        result.pastes.push(args[++i]);
        break;
      case "--paste-from-file":
        result.pasteFiles.push(args[++i]);
        break;
      case "--write":
        result.write = true;
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
      case "--diff-only":
        result.diffOnly = true;
        break;
      case "--output":
        result.output = args[++i];
        break;
      default:
        if (!arg.startsWith("--") && !result.gymId) {
          result.gymId = arg;
        }
    }
  }

  if (!result.gymId) {
    throw new Error(
      "Usage: npm run ingest -- --gym <gymId> [--url URL --pdf FILE --docx FILE --schedule CSV --paste TEXT --paste-from-file TXT] [--write] [--dry-run]",
    );
  }
  if (
    result.urls.length === 0 &&
    result.pdfs.length === 0 &&
    result.docxs.length === 0 &&
    result.schedules.length === 0 &&
    result.pastes.length === 0 &&
    result.pasteFiles.length === 0
  ) {
    throw new Error("At least one source (--url/--pdf/--docx/--schedule/--paste) is required.");
  }
  return result;
}

async function loadExisting(gymId: string): Promise<ProposedChunk[]> {
  try {
    return getGymFaqChunks(gymId).map((chunk) => ({
      id: chunk.id,
      category: chunk.category,
      content: chunk.content,
    }));
  } catch {
    return [];
  }
}

async function runExtractors(
  args: IngestArgs,
): Promise<{ documents: ExtractedDocument[]; structuredChunks: ProposedChunk[] }> {
  const documents: ExtractedDocument[] = [];
  const structuredChunks: ProposedChunk[] = [];

  for (const url of args.urls) {
    console.log(`  • crawling ${url}`);
    const docs = await extractFromUrl(url);
    documents.push(...docs);
    console.log(`    ↳ ${docs.length} page(s)`);
  }

  for (const pdf of args.pdfs) {
    console.log(`  • parsing PDF ${pdf}`);
    documents.push(await extractFromPdfFile(pdf));
  }

  for (const docx of args.docxs) {
    console.log(`  • parsing DOCX ${docx}`);
    documents.push(await extractFromDocxFile(docx));
  }

  for (const schedule of args.schedules) {
    console.log(`  • parsing schedule CSV ${schedule}`);
    const result = await extractFromScheduleFile(schedule, "classes");
    documents.push(result.document);
    structuredChunks.push(...result.chunks);
    console.log(`    ↳ ${result.chunks.length} class slot(s)`);
  }

  for (const text of args.pastes) {
    documents.push(extractFromPastedText(text, `cli-paste-${documents.length}`));
  }

  for (const file of args.pasteFiles) {
    const buffer = await fs.readFile(file, "utf-8");
    documents.push(extractFromPastedText(buffer, file, path.basename(file)));
  }

  return { documents, structuredChunks };
}

function formatDiff(diff: ReturnType<typeof diffProposedChunks>) {
  console.log("\nDiff summary:");
  console.log(`  + ${diff.added.length} new chunks`);
  console.log(`  ~ ${diff.changed.length} changed chunks`);
  console.log(`  = ${diff.unchanged.length} unchanged chunks`);
  console.log(`  - ${diff.removed.length} existing chunks NOT covered by new sources`);

  if (diff.added.length > 0) {
    console.log("\nNew chunks (preview):");
    for (const chunk of diff.added.slice(0, 10)) {
      console.log(`  + [${chunk.category}] ${chunk.id}`);
      console.log(`     ${chunk.content.slice(0, 140)}`);
    }
    if (diff.added.length > 10) {
      console.log(`  ...and ${diff.added.length - 10} more`);
    }
  }

  if (diff.changed.length > 0) {
    console.log("\nChanged chunks (preview):");
    for (const { existing, proposed } of diff.changed.slice(0, 5)) {
      console.log(`  ~ ${existing.id} → ${proposed.id}`);
      console.log(`     was: ${existing.content.slice(0, 120)}`);
      console.log(`     new: ${proposed.content.slice(0, 120)}`);
    }
  }

  if (diff.removed.length > 0) {
    console.log("\nExisting chunks not in new sources (kept by default):");
    for (const chunk of diff.removed.slice(0, 5)) {
      console.log(`  - ${chunk.id}`);
    }
  }
}

async function main() {
  const args = parseArgs();

  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY.");
    process.exit(1);
  }

  const config = getGymConfig(args.gymId);
  console.log(`Ingestion for "${config.name}" (${args.gymId})`);
  console.log("Sources:");

  const { documents, structuredChunks } = await runExtractors(args);
  console.log(
    `\nExtracted ${documents.length} document(s) and ${structuredChunks.length} structured chunk(s).`,
  );

  let llmChunks: ProposedChunk[] = [];
  if (documents.length > 0) {
    console.log("\nRunning LLM chunker (gpt-4o)...");
    const result = await chunkDocumentsWithLLM(documents, config.categories);
    llmChunks = result.chunks;
    console.log(`  ↳ ${result.chunks.length} chunk(s)`);
    if (result.tokensIn || result.tokensOut) {
      console.log(`  ↳ tokens in=${result.tokensIn} out=${result.tokensOut}`);
    }
    for (const warning of result.warnings) {
      console.warn(`  ! ${warning}`);
    }
  }

  // Structured schedule chunks override any LLM-produced chunks with the same id.
  const mergedById = new Map<string, ProposedChunk>();
  for (const chunk of llmChunks) mergedById.set(chunk.id, chunk);
  for (const chunk of structuredChunks) mergedById.set(chunk.id, chunk);
  const proposed = Array.from(mergedById.values());

  const existing = await loadExisting(args.gymId);
  const diff = diffProposedChunks(proposed, existing);

  formatDiff(diff);

  const merged: ProposedChunk[] = [
    ...existing.filter(
      (chunk) =>
        diff.unchanged.includes(chunk) ||
        diff.removed.includes(chunk) ||
        diff.changed.some((c) => c.existing.id === chunk.id) === false,
    ),
    ...diff.changed.map((entry) => entry.proposed),
    ...diff.added,
  ];

  // Replace changed in their existing positions:
  const final: ProposedChunk[] = [];
  const handled = new Set<string>();
  for (const chunk of existing) {
    const changedEntry = diff.changed.find((c) => c.existing.id === chunk.id);
    if (changedEntry) {
      final.push(changedEntry.proposed);
      handled.add(changedEntry.proposed.id);
    } else {
      final.push(chunk);
      handled.add(chunk.id);
    }
  }
  for (const chunk of diff.added) {
    if (!handled.has(chunk.id)) {
      final.push(chunk);
      handled.add(chunk.id);
    }
  }

  const output = args.output ?? `data/gyms/${args.gymId}/faq.json`;
  const diffPath = `data/gyms/${args.gymId}/ingest-diff.json`;

  if (args.dryRun || (!args.write && !args.diffOnly)) {
    console.log(
      `\nDry run — no files written. Use --write to update ${output} (and re-run npm run seed -- ${args.gymId} afterward).`,
    );
  }

  if (args.write) {
    await fs.writeFile(output, JSON.stringify(final, null, 2) + "\n");
    console.log(`\n✓ Wrote ${final.length} chunks → ${output}`);
    console.log(`  Next: npm run seed -- ${args.gymId}`);
  }

  if (args.diffOnly || args.write) {
    await fs.writeFile(
      diffPath,
      JSON.stringify(
        {
          gymId: args.gymId,
          generatedAt: new Date().toISOString(),
          proposed,
          diff,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`✓ Wrote diff snapshot → ${diffPath}`);
  }

  // Drop unused legacy reference to avoid unused-var lints.
  void merged;
}

main().catch((error) => {
  console.error("\n✗ Ingestion failed:", error);
  process.exit(1);
});
