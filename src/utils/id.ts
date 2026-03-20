import { ulid } from "ulid";

/**
 * Generate a new ULID.
 * ULIDs are lexicographically sortable by creation time.
 */
export function newId(): string {
  return ulid();
}

/**
 * Generate a ULID with a specific timestamp (for testing/seeding).
 */
export function newIdAt(timestamp: number): string {
  return ulid(timestamp);
}
