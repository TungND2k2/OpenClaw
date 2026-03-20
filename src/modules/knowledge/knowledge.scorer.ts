/**
 * Knowledge relevance scoring with time decay, votes, and usage.
 */

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Compute effective relevance with time decay, vote boost, and usage boost.
 */
export function computeEffectiveRelevance(entry: {
  relevanceScore: number;
  upvotes: number;
  downvotes: number;
  usageCount: number;
  createdAt: number;
}): number {
  const now = Date.now();
  const daysSinceCreation = (now - entry.createdAt) / (1000 * 60 * 60 * 24);

  // Time decay: loses 30% per year, floor at 0.1
  const timeDecay = Math.max(0.1, 1.0 - (daysSinceCreation / 365) * 0.3);

  // Vote factor: each net upvote +5%, cap at 2.0
  const voteFactor = Math.min(2.0, 1.0 + (entry.upvotes - entry.downvotes) * 0.05);

  // Usage factor: logarithmic boost
  const usageFactor = 1.0 + Math.log2(1 + entry.usageCount) * 0.1;

  return entry.relevanceScore * timeDecay * voteFactor * usageFactor;
}

/**
 * Score how well a knowledge entry matches a task context.
 */
export function computeMatchScore(
  entry: {
    tags: string[];
    domain: string;
    relevanceScore: number;
    upvotes: number;
    downvotes: number;
    usageCount: number;
    createdAt: number;
  },
  context: {
    tags: string[];
    capabilities: string[];
    domain: string;
  }
): number {
  const tagOverlap = jaccard(context.tags, entry.tags);
  const capabilityOverlap = jaccard(context.capabilities, entry.tags);
  const domainMatch = context.domain === entry.domain ? 1.0 : 0.2;
  const effectiveRelevance = computeEffectiveRelevance(entry);

  return (
    tagOverlap * 0.35 +
    capabilityOverlap * 0.25 +
    domainMatch * 0.25 +
    effectiveRelevance * 0.15
  );
}
