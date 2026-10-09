import type { ChunkDiff, ProposedChunk } from "./types";

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function shingles(text: string, size = 5): Set<string> {
  const words = normalize(text).split(" ");
  const set = new Set<string>();
  if (words.length < size) {
    set.add(words.join(" "));
    return set;
  }
  for (let i = 0; i <= words.length - size; i += 1) {
    set.add(words.slice(i, i + size).join(" "));
  }
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  a.forEach((item) => {
    if (b.has(item)) intersection += 1;
  });
  return intersection / (a.size + b.size - intersection);
}

/**
 * Compute the diff between newly proposed chunks and an existing FAQ.
 * Matching uses chunk id first, then content similarity (~5-word shingles).
 * - added: proposed chunk has no match in existing
 * - changed: matching chunk found but content differs
 * - unchanged: matching chunk and content is essentially identical
 * - removed: existing chunk that has no proposed counterpart (informational only)
 */
export function diffProposedChunks(
  proposed: ProposedChunk[],
  existing: ProposedChunk[],
  options: { similarityThreshold?: number } = {},
): ChunkDiff {
  const threshold = options.similarityThreshold ?? 0.7;
  const existingById = new Map(existing.map((chunk) => [chunk.id, chunk]));
  const existingShingles = existing.map((chunk) => ({
    chunk,
    shingles: shingles(chunk.content),
  }));

  const added: ProposedChunk[] = [];
  const changed: Array<{ existing: ProposedChunk; proposed: ProposedChunk }> = [];
  const unchanged: ProposedChunk[] = [];
  const matchedExistingIds = new Set<string>();

  for (const proposedChunk of proposed) {
    const byId = existingById.get(proposedChunk.id);
    if (byId) {
      matchedExistingIds.add(byId.id);
      if (normalize(byId.content) === normalize(proposedChunk.content)) {
        unchanged.push(byId);
      } else {
        changed.push({ existing: byId, proposed: proposedChunk });
      }
      continue;
    }

    const proposedSet = shingles(proposedChunk.content);
    let bestMatch: { chunk: ProposedChunk; score: number } | null = null;
    for (const existingEntry of existingShingles) {
      if (matchedExistingIds.has(existingEntry.chunk.id)) continue;
      const score = jaccard(proposedSet, existingEntry.shingles);
      if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { chunk: existingEntry.chunk, score };
      }
    }

    if (bestMatch) {
      matchedExistingIds.add(bestMatch.chunk.id);
      changed.push({ existing: bestMatch.chunk, proposed: proposedChunk });
    } else {
      added.push(proposedChunk);
    }
  }

  const removed = existing.filter(
    (chunk) => !matchedExistingIds.has(chunk.id),
  );

  return { added, changed, unchanged, removed };
}
