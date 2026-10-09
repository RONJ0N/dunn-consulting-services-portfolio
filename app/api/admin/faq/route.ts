import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { isAdminAuthenticated } from "@/lib/admin/session";
import { getGymConfig, getGymFaqChunks, listGymIds } from "@/lib/gym/config";
import { saveEmbeddingsToDb } from "@/lib/gym/db-config";
import { embedTexts } from "@/lib/rag/embed";
import { clearCachedGymRecords } from "@/lib/rag/cache";

const chunkSchema = z.object({
  id: z.string().min(2).max(80).regex(/^[a-z0-9_-]+$/i),
  category: z.string().min(1),
  content: z.string().min(8).max(1200),
});

const putSchema = z.object({
  gymId: z.string().min(1),
  chunks: z.array(chunkSchema),
});

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const gymId = searchParams.get("gymId");
  if (!gymId) {
    return Response.json({ gyms: listGymIds() });
  }
  try {
    const config = getGymConfig(gymId);
    const chunks = getGymFaqChunks(gymId);
    return Response.json({
      gymId,
      gymName: config.name,
      categories: config.categories,
      chunks,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 404 },
    );
  }
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const parsed = putSchema.parse(await request.json());
    const config = getGymConfig(parsed.gymId);
    const allowed = new Set(config.categories.map((c) => c.id));
    const invalid = parsed.chunks.filter((chunk) => !allowed.has(chunk.category));
    if (invalid.length > 0) {
      return Response.json(
        {
          error: `Some chunks use undeclared categories: ${invalid.map((c) => c.id).join(", ")}`,
        },
        { status: 400 },
      );
    }

    const ids = parsed.chunks.map((chunk) => chunk.id);
    if (new Set(ids).size !== ids.length) {
      return Response.json(
        { error: "Duplicate chunk ids are not allowed." },
        { status: 400 },
      );
    }

    const filePath = path.join(
      process.cwd(),
      "data",
      "gyms",
      parsed.gymId,
      "faq.json",
    );
    await fs.writeFile(filePath, JSON.stringify(parsed.chunks, null, 2) + "\n");

    // Re-embed and persist to the DB so the deployed chatbot serves the edited
    // knowledge immediately — no redeploy or manual seed step required. The
    // file write above keeps the repo copy in sync for local/dev use.
    let embedded = 0;
    let embedError: string | undefined;
    try {
      const embeddings = await embedTexts(parsed.chunks.map((c) => c.content));
      const records = parsed.chunks.map((chunk, index) => ({
        id: chunk.id,
        category: chunk.category,
        content: chunk.content,
        embedding: embeddings[index],
      }));
      await saveEmbeddingsToDb(parsed.gymId, records);
      clearCachedGymRecords(parsed.gymId);
      embedded = records.length;
    } catch (error) {
      embedError =
        error instanceof Error ? error.message : "Failed to refresh embeddings";
      console.error("[faq put] embedding sync failed", error);
    }

    return Response.json({
      ok: true,
      written: parsed.chunks.length,
      embedded,
      embedError,
      message: embedError
        ? `Wrote ${parsed.chunks.length} chunks to disk, but embedding refresh failed: ${embedError}. Run "npm run seed -- ${parsed.gymId}" to retry.`
        : `Wrote ${parsed.chunks.length} chunks and refreshed ${embedded} embeddings in the database.`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: error.flatten() }, { status: 400 });
    }
    console.error("[faq put]", error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
