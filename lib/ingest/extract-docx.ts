import fs from "fs/promises";
import path from "path";
import mammoth from "mammoth";
import type { ExtractedDocument } from "./types";

export async function extractFromDocxBuffer(
  buffer: Buffer,
  source = "docx",
  title?: string,
): Promise<ExtractedDocument> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.replace(/\r/g, "").trim();
  if (text.length === 0) {
    throw new Error(`No text extracted from DOCX: ${source}`);
  }
  return {
    source,
    title: title ?? path.basename(source),
    text,
    kind: "docx",
  };
}

export async function extractFromDocxFile(
  filePath: string,
): Promise<ExtractedDocument> {
  const buffer = await fs.readFile(filePath);
  return extractFromDocxBuffer(buffer, filePath, path.basename(filePath));
}
