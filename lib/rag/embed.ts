import fs from "fs";
import path from "path";
import { getOpenAIClient, EMBEDDING_MODEL } from "../openai";
import { getGymFaqChunks } from "../gym/config";

export async function embedText(text: string): Promise<number[]> {
  const openai = getOpenAIClient();
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return response.data[0].embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const openai = getOpenAIClient();
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });

  return response.data.map((item) => item.embedding);
}

export function saveEmbeddings(
  gymId: string,
  records: Array<{
    id: string;
    category: string;
    content: string;
    embedding: number[];
  }>,
) {
  const outputPath = path.join(
    process.cwd(),
    "data",
    "gyms",
    gymId,
    "embeddings.json",
  );
  fs.writeFileSync(outputPath, JSON.stringify(records, null, 2));
}

export async function seedGymEmbeddings(gymId: string) {
  const chunks = getGymFaqChunks(gymId);
  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));

  const records = chunks.map((chunk, index) => ({
    id: chunk.id,
    category: chunk.category,
    content: chunk.content,
    embedding: embeddings[index],
  }));

  saveEmbeddings(gymId, records);
  return records.length;
}
