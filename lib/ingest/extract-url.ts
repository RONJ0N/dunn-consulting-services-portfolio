import * as cheerio from "cheerio";
import type { ExtractedDocument } from "./types";

const SKIP_TAGS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "nav",
  "footer",
  "header",
  "aside",
];

const DEFAULT_USER_AGENT =
  "GymAIBot/1.0 (+https://gym-ai.example.com/bot) onboarding-ingest";

export interface UrlExtractOptions {
  /** Maximum number of pages to crawl from this seed URL. */
  maxPages?: number;
  /** Depth limit: 0 = seed page only, 1 = + direct links, etc. */
  maxDepth?: number;
  /** Restrict to the same hostname as the seed. */
  sameHostOnly?: boolean;
  /** Skip URLs whose path matches any of these patterns. */
  excludePathPatterns?: RegExp[];
  fetchTimeoutMs?: number;
}

function cleanHtml(html: string): { title: string | undefined; text: string } {
  const $ = cheerio.load(html);
  const title = $("head > title").first().text().trim() || undefined;

  for (const tag of SKIP_TAGS) {
    $(tag).remove();
  }

  // Prefer <main> if present, else <article>, else <body>.
  const root = $("main").first().length
    ? $("main").first()
    : $("article").first().length
      ? $("article").first()
      : $("body");

  const blocks: string[] = [];
  root.find("h1, h2, h3, h4, h5, h6, p, li, td").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length > 0) {
      blocks.push(text);
    }
  });

  return {
    title,
    text: blocks.join("\n").trim(),
  };
}

function shouldVisit(
  link: string,
  seedHost: string,
  options: Required<UrlExtractOptions>,
): boolean {
  try {
    const url = new URL(link);
    if (options.sameHostOnly && url.hostname !== seedHost) {
      return false;
    }
    for (const pattern of options.excludePathPatterns) {
      if (pattern.test(url.pathname)) {
        return false;
      }
    }
    if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|mp4|mp3|zip)(\?|$)/i.test(url.pathname)) {
      return false;
    }
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": DEFAULT_USER_AGENT },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function extractFromUrl(
  seedUrl: string,
  options: UrlExtractOptions = {},
): Promise<ExtractedDocument[]> {
  const config: Required<UrlExtractOptions> = {
    maxPages: options.maxPages ?? 15,
    maxDepth: options.maxDepth ?? 2,
    sameHostOnly: options.sameHostOnly ?? true,
    excludePathPatterns: options.excludePathPatterns ?? [
      /\/(blog|news|press|careers|jobs|login|signin|signup|cart|checkout)\b/i,
      /^\/(privacy|terms|cookies?)/i,
    ],
    fetchTimeoutMs: options.fetchTimeoutMs ?? 12000,
  };

  let seed: URL;
  try {
    seed = new URL(seedUrl);
  } catch {
    throw new Error(`Invalid seed URL: ${seedUrl}`);
  }

  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [
    { url: seed.toString(), depth: 0 },
  ];
  const docs: ExtractedDocument[] = [];

  while (queue.length > 0 && docs.length < config.maxPages) {
    const next = queue.shift();
    if (!next) {
      break;
    }
    const normalized = next.url.split("#")[0];
    if (visited.has(normalized)) {
      continue;
    }
    visited.add(normalized);

    let response: Response;
    try {
      response = await fetchWithTimeout(normalized, config.fetchTimeoutMs);
    } catch (error) {
      console.warn(`[ingest:url] fetch failed for ${normalized}:`, error);
      continue;
    }
    if (!response.ok) {
      console.warn(`[ingest:url] ${response.status} ${normalized}`);
      continue;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/.test(contentType)) {
      continue;
    }

    const html = await response.text();
    const { title, text } = cleanHtml(html);
    if (text.length > 50) {
      docs.push({
        source: normalized,
        title,
        text,
        kind: "url",
      });
    }

    if (next.depth < config.maxDepth) {
      const $ = cheerio.load(html);
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        let absolute: string;
        try {
          absolute = new URL(href, normalized).toString();
        } catch {
          return;
        }
        if (
          shouldVisit(absolute, seed.hostname, config) &&
          !visited.has(absolute.split("#")[0])
        ) {
          queue.push({ url: absolute, depth: next.depth + 1 });
        }
      });
    }
  }

  if (docs.length === 0) {
    throw new Error(`No usable content extracted from ${seedUrl}`);
  }

  return docs;
}
