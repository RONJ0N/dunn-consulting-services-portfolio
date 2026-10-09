import type { ExtractedDocument } from "./types";

export function extractFromPastedText(
  text: string,
  source = "pasted",
  title?: string,
): ExtractedDocument {
  const cleaned = text.replace(/\r/g, "").trim();
  if (cleaned.length === 0) {
    throw new Error("Pasted text is empty.");
  }
  return {
    source,
    title,
    text: cleaned,
    kind: "paste",
  };
}
