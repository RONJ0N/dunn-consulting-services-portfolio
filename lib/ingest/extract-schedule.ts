import fs from "fs/promises";
import path from "path";
import Papa from "papaparse";
import type { ExtractedDocument, ProposedChunk } from "./types";

interface ScheduleRow {
  class_name: string;
  day: string;
  start_time: string;
  end_time?: string;
  duration?: string;
  instructor?: string;
  level?: string;
  notes?: string;
  category?: string;
}

const FIELD_ALIASES: Record<keyof ScheduleRow, string[]> = {
  class_name: ["class_name", "class", "name", "title", "program"],
  day: ["day", "weekday", "dow"],
  start_time: ["start_time", "start", "time", "starts", "begin"],
  end_time: ["end_time", "end", "ends", "finish"],
  duration: ["duration", "length", "mins", "minutes"],
  instructor: ["instructor", "coach", "trainer", "leader"],
  level: ["level", "intensity", "difficulty"],
  notes: ["notes", "note", "description", "details"],
  category: ["category", "group", "type"],
};

function normalizeRow(row: Record<string, string>): ScheduleRow | null {
  const normalized: Partial<ScheduleRow> = {};
  for (const [key, aliases] of Object.entries(FIELD_ALIASES) as Array<
    [keyof ScheduleRow, string[]]
  >) {
    for (const alias of aliases) {
      const value = row[alias] ?? row[alias.toLowerCase()] ?? row[alias.toUpperCase()];
      if (value && typeof value === "string" && value.trim().length > 0) {
        normalized[key] = value.trim();
        break;
      }
    }
  }

  if (!normalized.class_name || !normalized.day || !normalized.start_time) {
    return null;
  }
  return normalized as ScheduleRow;
}

function chunkIdFromRow(row: ScheduleRow): string {
  const slug = `${row.class_name}-${row.day}-${row.start_time}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `class-${slug}`.slice(0, 80);
}

function describeRow(row: ScheduleRow): string {
  const parts: string[] = [];
  parts.push(`${row.class_name} runs ${row.day} at ${row.start_time}`);
  if (row.end_time) {
    parts.push(`(until ${row.end_time})`);
  } else if (row.duration) {
    parts.push(`(${row.duration})`);
  }
  if (row.level) {
    parts.push(`Level: ${row.level}.`);
  }
  if (row.instructor) {
    parts.push(`Instructor: ${row.instructor}.`);
  }
  if (row.notes) {
    parts.push(row.notes.trim().endsWith(".") ? row.notes : `${row.notes}.`);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export interface ScheduleExtractResult {
  document: ExtractedDocument;
  /** Chunks produced directly from the CSV — no LLM call needed. */
  chunks: ProposedChunk[];
}

/**
 * Parse a class-schedule CSV into both an ExtractedDocument (raw text fallback
 * for the LLM chunker) AND a list of pre-built FAQ chunks (one per class slot).
 * Schedules are the highest-value, most-frequently-updated data — a structured
 * importer means "drop in new CSV, re-run" instead of re-running the LLM.
 */
export async function extractFromScheduleCsv(
  csvText: string,
  options: { source?: string; defaultCategoryId?: string } = {},
): Promise<ScheduleExtractResult> {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  if (parsed.errors.length > 0) {
    console.warn("[ingest:schedule] CSV parse warnings:", parsed.errors.slice(0, 3));
  }

  const rows = parsed.data
    .map(normalizeRow)
    .filter((row): row is ScheduleRow => row !== null);

  if (rows.length === 0) {
    throw new Error(
      "Schedule CSV could not be parsed. Required columns: class_name, day, start_time.",
    );
  }

  const chunks: ProposedChunk[] = rows.map((row) => ({
    id: chunkIdFromRow(row),
    category: row.category?.toLowerCase().replace(/\s+/g, "_") ?? options.defaultCategoryId ?? "classes",
    content: describeRow(row),
    sourceRefs: options.source ? [options.source] : undefined,
  }));

  return {
    document: {
      source: options.source ?? "schedule.csv",
      title: "Class schedule",
      text: chunks.map((chunk) => chunk.content).join("\n"),
      kind: "schedule",
    },
    chunks,
  };
}

export async function extractFromScheduleFile(
  filePath: string,
  defaultCategoryId?: string,
): Promise<ScheduleExtractResult> {
  const csvText = await fs.readFile(filePath, "utf-8");
  return extractFromScheduleCsv(csvText, {
    source: filePath,
    defaultCategoryId,
  });
}

export async function extractFromScheduleBuffer(
  buffer: Buffer,
  source = "schedule.csv",
  defaultCategoryId?: string,
): Promise<ScheduleExtractResult> {
  return extractFromScheduleCsv(buffer.toString("utf-8"), {
    source,
    defaultCategoryId,
  });
}

export function basenameFromPath(filePath: string): string {
  return path.basename(filePath);
}
