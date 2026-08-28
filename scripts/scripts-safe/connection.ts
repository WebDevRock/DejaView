import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type BetterSqlite3Type from "better-sqlite3";
import * as schema from "./schema";

// require avoids ESM/CJS interop issues with the native better-sqlite3 module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BetterSqlite3 = require("better-sqlite3") as typeof BetterSqlite3Type;

export interface DatabaseConnection {
  sqlite: BetterSqlite3Type.Database;
  db: ReturnType<typeof drizzle<typeof schema>>;
  close(): void;
}

function resolveDatabasePath(filename: string): string {
  if (filename === ":memory:") return filename;
  return path.resolve(process.cwd(), filename);
}

export function openDatabase(
  filename = process.env.DATABASE_URL ?? "./data/dejaview.sqlite",
): DatabaseConnection {
  const databasePath = resolveDatabasePath(filename);
  if (databasePath !== ":memory:")
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const sqlite = new BetterSqlite3(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
    close: () => sqlite.close(),
  };
}
