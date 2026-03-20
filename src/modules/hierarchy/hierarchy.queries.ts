import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../db/connection.js";
import { agents, agentHierarchy } from "../../db/schema.js";

/**
 * Insert closure table entries when an agent is added to the hierarchy.
 * Creates self-reference (depth 0) + copies ancestor paths from parent.
 */
export function insertHierarchyEntries(
  agentId: string,
  parentAgentId: string | null
): void {
  const db = getDb();

  // Self-reference
  db.insert(agentHierarchy)
    .values({ ancestorId: agentId, descendantId: agentId, depth: 0 })
    .run();

  if (parentAgentId) {
    // Copy all ancestors of parent, incrementing depth by 1
    const parentAncestors = db
      .select({
        ancestorId: agentHierarchy.ancestorId,
        depth: agentHierarchy.depth,
      })
      .from(agentHierarchy)
      .where(eq(agentHierarchy.descendantId, parentAgentId))
      .all();

    for (const row of parentAncestors) {
      db.insert(agentHierarchy)
        .values({
          ancestorId: row.ancestorId,
          descendantId: agentId,
          depth: row.depth + 1,
        })
        .run();
    }
  }
}

/**
 * Remove all closure table entries for an agent.
 * Used before re-parenting.
 */
export function removeHierarchyEntries(agentId: string): void {
  const db = getDb();

  // Get all descendants of this agent (excluding self at depth 0 initially)
  const descendants = db
    .select({ descendantId: agentHierarchy.descendantId })
    .from(agentHierarchy)
    .where(
      and(
        eq(agentHierarchy.ancestorId, agentId),
        sql`${agentHierarchy.depth} > 0`
      )
    )
    .all();

  // Remove entries where this agent is a descendant (its ancestor paths)
  db.delete(agentHierarchy)
    .where(eq(agentHierarchy.descendantId, agentId))
    .run();

  // For each descendant, remove entries that go through this agent
  // (entries where ancestor is an ancestor of agentId)
  for (const desc of descendants) {
    db.delete(agentHierarchy)
      .where(
        and(
          eq(agentHierarchy.descendantId, desc.descendantId),
          sql`${agentHierarchy.ancestorId} NOT IN (
            SELECT ancestor_id FROM agent_hierarchy WHERE descendant_id = ${desc.descendantId}
            AND ancestor_id = descendant_id
          )`
        )
      )
      .run();
  }
}

/**
 * Get all descendants of an agent (agents under their command).
 */
export function getDescendants(
  agentId: string,
  maxDepth?: number
): { descendantId: string; depth: number }[] {
  const db = getDb();

  const conditions = [
    eq(agentHierarchy.ancestorId, agentId),
    sql`${agentHierarchy.depth} > 0`,
  ];

  if (maxDepth !== undefined) {
    conditions.push(sql`${agentHierarchy.depth} <= ${maxDepth}`);
  }

  return db
    .select({
      descendantId: agentHierarchy.descendantId,
      depth: agentHierarchy.depth,
    })
    .from(agentHierarchy)
    .where(and(...conditions))
    .all();
}

/**
 * Get all ancestors of an agent (chain of command up to Commander).
 */
export function getAncestors(
  agentId: string
): { ancestorId: string; depth: number }[] {
  const db = getDb();
  return db
    .select({
      ancestorId: agentHierarchy.ancestorId,
      depth: agentHierarchy.depth,
    })
    .from(agentHierarchy)
    .where(
      and(
        eq(agentHierarchy.descendantId, agentId),
        sql`${agentHierarchy.depth} > 0`
      )
    )
    .orderBy(agentHierarchy.depth)
    .all();
}

/**
 * Check if ancestor is actually an ancestor of descendant.
 */
export function isAncestorOf(
  ancestorId: string,
  descendantId: string
): boolean {
  const db = getDb();
  const row = db
    .select({ depth: agentHierarchy.depth })
    .from(agentHierarchy)
    .where(
      and(
        eq(agentHierarchy.ancestorId, ancestorId),
        eq(agentHierarchy.descendantId, descendantId),
        sql`${agentHierarchy.depth} > 0`
      )
    )
    .get();
  return row !== undefined;
}

/**
 * Get direct children (depth = 1) of an agent.
 */
export function getDirectChildren(agentId: string): string[] {
  const db = getDb();
  const rows = db
    .select({ descendantId: agentHierarchy.descendantId })
    .from(agentHierarchy)
    .where(
      and(
        eq(agentHierarchy.ancestorId, agentId),
        eq(agentHierarchy.depth, 1)
      )
    )
    .all();
  return rows.map((r) => r.descendantId);
}

/**
 * Count direct children of an agent.
 */
export function countDirectChildren(agentId: string): number {
  const db = getDb();
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(agentHierarchy)
    .where(
      and(
        eq(agentHierarchy.ancestorId, agentId),
        eq(agentHierarchy.depth, 1)
      )
    )
    .get();
  return row?.count ?? 0;
}
