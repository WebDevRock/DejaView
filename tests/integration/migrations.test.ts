// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  openDatabase,
  type DatabaseConnection,
} from "@/infrastructure/db/client";
import { runMigrations } from "@/infrastructure/db/migrator";

const connections: DatabaseConnection[] = [];
const temporaryDirectories: string[] = [];
const projectMigrations = path.resolve(process.cwd(), "migrations");

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dejaview-"));
  temporaryDirectories.push(directory);
  return directory;
}

function copyMigration(filename: string, destination: string): void {
  fs.copyFileSync(
    path.join(projectMigrations, filename),
    path.join(destination, filename),
  );
}

function database(): DatabaseConnection {
  const connection = openDatabase(
    path.join(temporaryDirectory(), "test.sqlite"),
  );
  connections.push(connection);
  return connection;
}

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe("checksum migrations", () => {
  it("creates the complete schema and synchronised FTS5 index on a fresh database", () => {
    const connection = database();

    const result = runMigrations(connection.sqlite, projectMigrations);

    expect(result.applied).toEqual(["0001_initial.sql", "0002_search_fts.sql"]);
    const tables = connection.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "users",
        "knowledge_articles",
        "knowledge_steps",
        "step_edges",
        "applications",
        "article_applications",
        "tags",
        "article_tags",
        "support_cases",
        "external_sources",
        "knowledge_source_links",
        "article_feedback",
        "search_documents",
        "search_documents_fts",
        "schema_migrations",
      ]),
    );

    connection.sqlite
      .prepare(
        `INSERT INTO search_documents
      (id, entity_type, entity_id, source_label, title, body, exact_terms, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "doc-1",
        "article",
        "article-1",
        "Knowledge",
        "Printer failure",
        "Replace the cable",
        "E42",
        "published",
        "2026-08-28T09:15:00.000Z",
      );
    const match = connection.sqlite
      .prepare(
        "SELECT rowid FROM search_documents_fts WHERE search_documents_fts MATCH ?",
      )
      .get("E42");
    expect(match).toBeDefined();
  });

  it("applies only new migrations on an upgrade", () => {
    const migrations = temporaryDirectory();
    copyMigration("0001_initial.sql", migrations);
    const connection = database();

    expect(runMigrations(connection.sqlite, migrations).applied).toEqual([
      "0001_initial.sql",
    ]);
    copyMigration("0002_search_fts.sql", migrations);
    expect(runMigrations(connection.sqlite, migrations).applied).toEqual([
      "0002_search_fts.sql",
    ]);
    expect(runMigrations(connection.sqlite, migrations).applied).toEqual([]);
  });

  it("rejects an applied migration whose checksum has changed", () => {
    const migrations = temporaryDirectory();
    copyMigration("0001_initial.sql", migrations);
    const connection = database();
    runMigrations(connection.sqlite, migrations);
    fs.appendFileSync(
      path.join(migrations, "0001_initial.sql"),
      "\n-- changed",
    );

    expect(() => runMigrations(connection.sqlite, migrations)).toThrow(
      /checksum mismatch.*0001_initial\.sql/i,
    );
  });

  it("rejects an applied migration whose file is missing", () => {
    const migrations = temporaryDirectory();
    copyMigration("0001_initial.sql", migrations);
    const connection = database();
    runMigrations(connection.sqlite, migrations);
    fs.rmSync(path.join(migrations, "0001_initial.sql"));

    expect(() => runMigrations(connection.sqlite, migrations)).toThrow(
      /applied migration.*0001_initial\.sql.*missing/i,
    );
  });

  it("rejects an unknown applied migration record", () => {
    const migrations = temporaryDirectory();
    const connection = database();
    runMigrations(connection.sqlite, migrations);
    connection.sqlite
      .prepare(
        "INSERT INTO schema_migrations (filename, checksum, applied_at) VALUES (?, ?, ?)",
      )
      .run("legacy.sql", "unknown", "2026-08-28T09:15:00.000Z");

    expect(() => runMigrations(connection.sqlite, migrations)).toThrow(
      /unknown applied migration.*legacy\.sql/i,
    );
  });

  it("rejects a newly discovered migration ordered below an applied migration", () => {
    const migrations = temporaryDirectory();
    fs.writeFileSync(
      path.join(migrations, "0002_second.sql"),
      "CREATE TABLE second (id TEXT PRIMARY KEY);",
    );
    const connection = database();
    runMigrations(connection.sqlite, migrations);
    fs.writeFileSync(
      path.join(migrations, "0001_first.sql"),
      "CREATE TABLE first (id TEXT PRIMARY KEY);",
    );

    expect(() => runMigrations(connection.sqlite, migrations)).toThrow(
      /out.of.order.*0001_first\.sql/i,
    );
  });
});
