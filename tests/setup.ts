import { loadConfig } from "../src/config.js";
import { runMigrations } from "../src/db/migrate.js";
import { closeDb } from "../src/db/connection.js";
import { afterAll, beforeAll } from "vitest";
import fs from "node:fs";

const TEST_DB = "./data/test.db";

beforeAll(() => {
  // Clean test db
  try { fs.unlinkSync(TEST_DB); } catch {}
  try { fs.unlinkSync(TEST_DB + "-wal"); } catch {}
  try { fs.unlinkSync(TEST_DB + "-shm"); } catch {}

  process.env.DATABASE_URL = TEST_DB;
  loadConfig();
  runMigrations();
});

afterAll(() => {
  closeDb();
  try { fs.unlinkSync(TEST_DB); } catch {}
  try { fs.unlinkSync(TEST_DB + "-wal"); } catch {}
  try { fs.unlinkSync(TEST_DB + "-shm"); } catch {}
});
