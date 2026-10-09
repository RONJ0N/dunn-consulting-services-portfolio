import { z } from "zod";
import { getOpenAIClient } from "@/lib/openai";
import type { GymCategory } from "@/lib/gym/config";
import type { ExtractedDocument, ProposedChunk } from "./types";

const CHUNKER_MODEL = "gpt-4o";
const MAX_INPUT_CHARS_PER_DOC = 12000;

const chunkSchema = z.object({
  id: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Chunk ids must be kebab-case lowercase."),
  category: z.string().min(1),
  content: z.string().min(8).max(800),
});

const responseSchema = z.object({
  chunks: z.array(chunkSchema).default([]),
});

function buildSystemPrompt(categories: GymCategory[]): string {
  const categoryList = categories
    .map((category) => {
      const description = category.description ?? category.name;
      const examples =
        category.examples && category.examples.length > 0
          ? ` (e.g., ${category.examples.slice(0, 2).join("; ")})`
          : "";
      return `- "${category.id}": ${description}${examples}`;
    })
    .join("\n");

  return `You are an expert FAQ author for a gym AI chatbot. You read raw extracted text from a gym's website/PDFs/handbook and output a clean JSON array of categorized one-fact chunks suitable for retrieval-augmented generation.

Strict rules:
1. ONE fact per chunk. If text contains "Basic is $29/month and Plus is $49", emit TWO chunks.
2. Each chunk MUST be self-contained — readable without any other chunk.
3. Each chunk MUST be 1-4 sentences, ~30-120 words, written in plain prose. No headings, no bullet markers, no HTML.
4. Categorize each chunk into exactly one of the gym's declared categories below. NEVER invent a category id.
5. Chunk IDs must be kebab-case, lowercase, and uniquely describe the fact (e.g., "membership-plus", "class-spin-mon", "pt-rates").
6. Skip marketing fluff, generic mission statements, and content that's not factual ("our community is amazing", "join the family today").
7. Prefer specific numbers, prices, days, times, hours over vague claims.
8. If text contradicts itself, prefer the most specific/explicit version.
9. Output VALID JSON only: { "chunks": [{ "id": ..., "category": ..., "content": ... }] }. No prose.

Allowed categories:
${categoryList}`;
}

function buildUserPrompt(documents: ExtractedDocument[]): string {
  const formatted = documents
    .map((doc, idx) => {
      const truncated =
        doc.text.length > MAX_INPUT_CHARS_PER_DOC
          ? doc.text.slice(0, MAX_INPUT_CHARS_PER_DOC) +
            `\n[...truncated ${doc.text.length - MAX_INPUT_CHARS_PER_DOC} chars]`
          : doc.text;
      return `=== Source ${idx + 1}: ${doc.kind} ${doc.title ? `— ${doc.title}` : ""} (${doc.source}) ===\n${truncated}`;
    })
    .join("\n\n");

  return `Extract every factual one-sentence-or-paragraph statement from the source(s) below into categorized chunks. Emit JSON only.\n\n${formatted}`;
}

export interface ChunkResult {
  chunks: ProposedChunk[];
  warnings: string[];
  tokensIn?: number;
  tokensOut?: number;
}

export async function chunkDocumentsWithLLM(
  documents: ExtractedDocument[],
  categories: GymCategory[],
): Promise<ChunkResult> {
  if (documents.length === 0) {
    return { chunks: [], warnings: ["No source documents provided."] };
  }
  if (categories.length === 0) {
    return {
      chunks: [],
      warnings: [
        "Gym has no declared categories — add them to config.json before chunking.",
      ],
    };
  }

  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: CHUNKER_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildSystemPrompt(categories) },
      { role: "user", content: buildUserPrompt(documents) },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsed;
  try {
    parsed = responseSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new Error(
      `LLM chunker returned invalid JSON. Raw response:\n${raw.slice(0, 800)}\n\n${error}`,
    );
  }

  const allowedIds = new Set(categories.map((c) => c.id));
  const warnings: string[] = [];
  const seenIds = new Set<string>();
  const finalChunks: ProposedChunk[] = [];

  for (const chunk of parsed.chunks) {
    if (!allowedIds.has(chunk.category)) {
      warnings.push(
        `Dropped chunk "${chunk.id}" — category "${chunk.category}" not declared.`,
      );
      continue;
    }
    if (seenIds.has(chunk.id)) {
      warnings.push(`Duplicate chunk id "${chunk.id}" dropped.`);
      continue;
    }
    seenIds.add(chunk.id);
    finalChunks.push({
      id: chunk.id,
      category: chunk.category,
      content: chunk.content.trim(),
      sourceRefs: documents.map((d) => d.source),
    });
  }

  return {
    chunks: finalChunks,
    warnings,
    tokensIn: response.usage?.prompt_tokens,
    tokensOut: response.usage?.completion_tokens,
  };
}
