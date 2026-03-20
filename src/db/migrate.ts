import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "./connection.js";

/**
 * Run all pending Drizzle migrations.
 * Called once at startup before any services initialize.
 */
export function runMigrations(): void {
  const db = getDb();
  migrate(db, { migrationsFolder: "./drizzle" });
}
