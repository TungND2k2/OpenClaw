/**
 * Embedding Service — vector embeddings using transformers.js (local, free).
 * Model: all-MiniLM-L6-v2 (384 dimensions)
 * First call downloads model (~80MB), subsequent calls fast (~50ms).
 */

let pipeline: any = null;

async function getPipeline() {
  if (pipeline) return pipeline;
  // Dynamic import — transformers.js is ESM
  const { pipeline: createPipeline } = await import("@xenova/transformers");
  pipeline = await createPipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  console.error("[Embedding] Model loaded: all-MiniLM-L6-v2 (384d)");
  return pipeline;
}

/**
 * Generate embedding vector for text.
 * Returns Float32Array of 384 dimensions.
 */
export async function embed(text: string): Promise<number[]> {
  const pipe = await getPipeline();
  const result = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(result.data as Float32Array).slice(0, 384);
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Embed + store in DB (for knowledge entries).
 */
export async function embedAndStore(knowledgeId: string, text: string): Promise<void> {
  try {
    const vector = await embed(text);
    const { getDb } = await import("../../db/connection.js");
    const { sql } = await import("drizzle-orm");
    const db = getDb();
    await db.execute(sql`UPDATE knowledge_entries SET embedding = ${JSON.stringify(vector)}::vector WHERE id = ${knowledgeId}`);
  } catch (e: any) {
    console.error(`[Embedding] Store failed: ${e.message}`);
  }
}

/**
 * Vector search — find similar knowledge entries.
 */
export async function vectorSearch(query: string, tenantId: string, limit = 5): Promise<{
  id: string; title: string; content: string; type: string; score: number; usageCount: number;
}[]> {
  try {
    const queryVector = await embed(query);
    const { getDb } = await import("../../db/connection.js");
    const { sql } = await import("drizzle-orm");
    const db = getDb();

    const results = await db.execute(sql`
      SELECT id, title, content, type, usage_count,
             1 - (embedding <=> ${JSON.stringify(queryVector)}::vector) as score
      FROM knowledge_entries
      WHERE tenant_id = ${tenantId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${JSON.stringify(queryVector)}::vector
      LIMIT ${limit}
    `);

    return (results as any[]).map((r: any) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      type: r.type,
      score: parseFloat(r.score) || 0,
      usageCount: r.usage_count ?? 0,
    }));
  } catch (e: any) {
    console.error(`[Embedding] Vector search failed: ${e.message}`);
    return [];
  }
}
