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
const directories: string[] = [];
const projectMigrations = path.resolve(process.cwd(), "migrations");

function database(): DatabaseConnection {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dejaview-fts-"));
  directories.push(directory);
  const connection = openDatabase(path.join(directory, "fts.sqlite"));
  connections.push(connection);
  return connection;
}

function insertDocument(connection: DatabaseConnection, term: string): void {
  connection.sqlite
    .prepare(
      `INSERT INTO search_documents
      (id, entity_type, entity_id, source_label, title, body, exact_terms, status, updated_at)
      VALUES ('document-1', 'article', 'article-1', 'Knowledge', 'Printer issue', 'Replace cable', ?, 'published',
        '2026-08-28T09:15:00.000Z')`,
    )
    .run(term);
}

function matchCount(connection: DatabaseConnection, term: string): number {
  const row = connection.sqlite
    .prepare(
      "SELECT COUNT(*) AS count FROM search_documents_fts WHERE search_documents_fts MATCH ?",
    )
    .get(term) as { count: number };
  return row.count;
}

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe("FTS5 search document synchronisation", () => {
  it("replaces indexed values when a search document is updated", () => {
    const connection = database();
    runMigrations(connection.sqlite, projectMigrations);
    insertDocument(connection, "E42");

    connection.sqlite
      .prepare(
        "UPDATE search_documents SET exact_terms = 'E99' WHERE id = 'document-1'",
      )
      .run();

    expect(matchCount(connection, "E42")).toBe(0);
    expect(matchCount(connection, "E99")).toBe(1);
  });

  it("removes indexed values when a search document is deleted", () => {
    const connection = database();
    runMigrations(connection.sqlite, projectMigrations);
    insertDocument(connection, "E42");

    connection.sqlite
      .prepare("DELETE FROM search_documents WHERE id = 'document-1'")
      .run();

    expect(matchCount(connection, "E42")).toBe(0);
  });

  it("rebuilds the index for documents that predate the FTS migration", () => {
    const migrations = fs.mkdtempSync(
      path.join(os.tmpdir(), "dejaview-fts-migrations-"),
    );
    directories.push(migrations);
    fs.copyFileSync(
      path.join(projectMigrations, "0001_initial.sql"),
      path.join(migrations, "0001_initial.sql"),
    );
    const connection = database();
    runMigrations(connection.sqlite, migrations);
    insertDocument(connection, "E42");
    fs.copyFileSync(
      path.join(projectMigrations, "0002_search_fts.sql"),
      path.join(migrations, "0002_search_fts.sql"),
    );

    runMigrations(connection.sqlite, migrations);

    expect(matchCount(connection, "E42")).toBe(1);
  });
});
