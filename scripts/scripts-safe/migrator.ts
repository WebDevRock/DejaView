import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";

interface MigrationRecord {
  filename: string;
  checksum: string;
}

export interface MigrationResult {
  applied: string[];
}

const migrationFilename = /^\d{4}_[a-z0-9_]+\.sql$/;

function checksum(sql: string): string {
  return crypto.createHash("sha256").update(sql, "utf8").digest("hex");
}

export function runMigrations(
  database: BetterSqlite3.Database,
  migrationsDirectory: string,
): MigrationResult {
  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const files = fs
    .readdirSync(migrationsDirectory)
    .filter((filename) => migrationFilename.test(filename))
    .sort((left, right) => left.localeCompare(right));
  const appliedRecords = database
    .prepare(
      "SELECT filename, checksum FROM schema_migrations ORDER BY filename",
    )
    .all() as MigrationRecord[];
  const appliedByFilename = new Map(
    appliedRecords.map((record) => [record.filename, record.checksum]),
  );
  const availableFiles = new Set(files);
  const applied: string[] = [];

  for (const record of appliedRecords) {
    if (!migrationFilename.test(record.filename)) {
      throw new Error(`Unknown applied migration record ${record.filename}`);
    }
    if (!availableFiles.has(record.filename)) {
      throw new Error(
        `Applied migration ${record.filename} is missing from the migrations directory`,
      );
    }
  }

  const highestApplied = appliedRecords.at(-1)?.filename;
  const outOfOrder =
    highestApplied === undefined
      ? undefined
      : files.find(
          (filename) =>
            !appliedByFilename.has(filename) && filename < highestApplied,
        );
  if (outOfOrder !== undefined) {
    throw new Error(
      `Out-of-order migration ${outOfOrder} is lower than applied migration ${highestApplied}`,
    );
  }

  for (const filename of files) {
    const sql = fs.readFileSync(
      path.join(migrationsDirectory, filename),
      "utf8",
    );
    const currentChecksum = checksum(sql);
    const recordedChecksum = appliedByFilename.get(filename);

    if (recordedChecksum !== undefined) {
      if (recordedChecksum !== currentChecksum)
        throw new Error(`Checksum mismatch for applied migration ${filename}`);
      continue;
    }

    database.transaction(() => {
      database.exec(sql);
      database
        .prepare(
          "INSERT INTO schema_migrations (filename, checksum, applied_at) VALUES (?, ?, ?)",
        )
        .run(filename, currentChecksum, new Date().toISOString());
    })();
    applied.push(filename);
  }

  return { applied };
}
