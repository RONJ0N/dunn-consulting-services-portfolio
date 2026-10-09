export interface ExtractedDocument {
  /** Stable identifier for the source (URL, filename, or "paste"). */
  source: string;
  /** Display title (page title, document name). */
  title?: string;
  /** Cleaned plaintext content. */
  text: string;
  /** Type of source for downstream chunker prompts. */
  kind: "url" | "pdf" | "docx" | "paste" | "schedule" | "other";
}

export interface ProposedChunk {
  id: string;
  category: string;
  content: string;
  sourceRefs?: string[];
}

export interface ChunkDiff {
  added: ProposedChunk[];
  changed: Array<{ existing: ProposedChunk; proposed: ProposedChunk }>;
  unchanged: ProposedChunk[];
  removed: ProposedChunk[];
}
