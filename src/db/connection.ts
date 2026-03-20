import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getConfig } from "../config.js";
import * as schema from "./schema.js";

let _db: ReturnType<typeof drizzle> | null = null;
let _sqlite: InstanceType<typeof Database> | null = null;

export function getDb() {
  if (_db) return _db;

  const config = getConfig();
  _sqlite = new Database(config.DATABASE_URL);

  // Enable WAL mode for concurrent reads
  _sqlite.pragma("journal_mode = WAL");
  // Enable foreign keys enforcement
  _sqlite.pragma("foreign_keys = ON");
  // Recommended: synchronous NORMAL for WAL mode
  _sqlite.pragma("synchronous = NORMAL");

  _db = drizzle(_sqlite, { schema });
  return _db;
}

export function getSqlite(): InstanceType<typeof Database> {
  if (!_sqlite) getDb();
  return _sqlite!;
}

export function closeDb(): void {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}
