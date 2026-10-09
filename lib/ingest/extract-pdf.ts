import fs from "fs/promises";
import path from "path";
import type { ExtractedDocument } from "./types";

// pdf-parse is CommonJS — load lazily to avoid Next.js bundling overhead.
async function loadPdfParse(): Promise<(buffer: Buffer) => Promise<{ text: string; numpages: number }>> {
  const mod: unknown = await import("pdf-parse");
  if (typeof mod === "function") {
    return mod as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
  }
  const cjs = mod as { default?: (buffer: Buffer) => Promise<{ text: string; numpages: number }> };
  if (cjs.default) {
    return cjs.default;
  }
  throw new Error("Failed to load pdf-parse: unexpected module shape.");
}

function cleanPdfText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractFromPdfBuffer(
  buffer: Buffer,
  source = "pdf",
  title?: string,
): Promise<ExtractedDocument> {
  const pdfParse = await loadPdfParse();
  const result = await pdfParse(buffer);
  const text = cleanPdfText(result.text);
  if (text.length === 0) {
    throw new Error(`No text extracted from PDF: ${source}`);
  }
  return {
    source,
    title: title ?? path.basename(source),
    text,
    kind: "pdf",
  };
}

export async function extractFromPdfFile(
  filePath: string,
): Promise<ExtractedDocument> {
  const buffer = await fs.readFile(filePath);
  return extractFromPdfBuffer(buffer, filePath, path.basename(filePath));
}
