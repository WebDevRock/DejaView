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

    expect(result.applied).toEqual([
      "0001_initial.sql",
      "0002_search_fts.sql",
      "0003_support_case_details.sql",
      "0004_support_case_version.sql",
      "0005_unique_external_promotion.sql",
      "0006_knowledge_only_provenance.sql",
    ]);
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
        "external_sources",
        "knowledge_source_links",
        "article_feedback",
        "search_documents",
        "search_documents_fts",
        "schema_migrations",
      ]),
    );
    expect(tables).not.toContain("support_cases");

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

  it("upgrades an existing 0002 database through immutable 0003 and 0004", () => {
    const migrations = temporaryDirectory();
    copyMigration("0001_initial.sql", migrations);
    copyMigration("0002_search_fts.sql", migrations);
    const connection = database();
    runMigrations(connection.sqlite, migrations);
    const before = fs.readFileSync(
      path.join(projectMigrations, "0003_support_case_details.sql"),
      "utf8",
    );
    copyMigration("0003_support_case_details.sql", migrations);
    copyMigration("0004_support_case_version.sql", migrations);
    expect(runMigrations(connection.sqlite, migrations).applied).toEqual([
      "0003_support_case_details.sql",
      "0004_support_case_version.sql",
    ]);
    expect(
      connection.sqlite
        .prepare("PRAGMA table_info(support_cases)")
        .all()
        .map((column) => (column as { name: string }).name),
    ).toEqual(expect.arrayContaining(["what_was_tried", "version"]));
    expect(
      fs.readFileSync(
        path.join(projectMigrations, "0003_support_case_details.sql"),
        "utf8",
      ),
    ).toBe(before);
  });

  it("converts support cases to provider-neutral knowledge provenance without losing content", () => {
    const migrations = temporaryDirectory();
    for (const filename of [
      "0001_initial.sql",
      "0002_search_fts.sql",
      "0003_support_case_details.sql",
      "0004_support_case_version.sql",
      "0005_unique_external_promotion.sql",
    ])
      copyMigration(filename, migrations);
    const connection = database();
    runMigrations(connection.sqlite, migrations);
    const now = "2026-08-28T09:15:00.000Z";
    connection.sqlite
      .prepare(
        `INSERT INTO users (id, display_name, status, created_at, updated_at)
         VALUES ('user-1', 'Migration user', 'active', ?, ?)`,
      )
      .run(now, now);
    connection.sqlite
      .prepare(
        `INSERT INTO knowledge_articles
         (id, stable_key, title, problem, status, created_by_user_id, updated_by_user_id, created_at, updated_at)
         VALUES
         ('article-1', 'KB-1', 'Existing knowledge', 'Existing problem', 'draft', 'user-1', 'user-1', ?, ?),
         ('article-external', 'KB-EXT', 'Imported knowledge', 'Imported problem', 'draft', 'user-1', 'user-1', ?, ?),
         ('article-linked-source', 'KB-LINK', 'Source-linked knowledge', 'Linked only through provenance', 'draft', 'user-1', 'user-1', ?, ?)`,
      )
      .run(now, now, now, now, now, now);
    connection.sqlite
      .prepare(
        `INSERT INTO external_sources
         (id, provider_type, name, enabled, base_url, config_json, secret_env_ref, created_at, updated_at)
         VALUES ('jira', 'jira', 'Configured Jira', 1, 'https://tenant.atlassian.net', '{}', 'JIRA_API_TOKEN', ?, ?)`,
      )
      .run(now, now);
    connection.sqlite
      .prepare(
        `INSERT INTO knowledge_source_links
         (id, article_id, source_kind, external_source_id, external_item_key, external_url, source_title, captured_at, snapshot_text, created_at)
         VALUES ('old-external', 'article-external', 'external_item', 'jira', 'SUP-9', 'https://tenant.atlassian.net/browse/SUP-9', NULL, ?, 'private snapshot', ?)`,
      )
      .run(now, now);
    connection.sqlite
      .prepare(
        `INSERT INTO support_cases
         (id, stable_key, title, description, occurred_at, resolution_notes, article_id, status,
          created_by_user_id, resolved_by_user_id, resolved_at, created_at, updated_at)
         VALUES
         ('case-linked', 'CASE-1', 'Linked case', 'Linked details', ?, 'Linked resolution', 'article-1', 'resolved', 'user-1', 'user-1', ?, ?, ?),
         ('case-open', 'CASE-2', 'Open case', 'Open details', ?, '', NULL, 'open', 'user-1', NULL, NULL, ?, ?),
         ('case-closed', 'CASE-3', 'Closed case', 'Closed details', ?, 'Closed resolution', NULL, 'closed', 'user-1', 'user-1', ?, ?, ?),
         ('case-source-linked', 'CASE-4', 'Provenance-linked case', 'Case relationship must win', '2026-08-27T08:00:00.000Z', 'Source-linked resolution', NULL, 'resolved', 'user-1', 'user-1', ?, ?, ?)`,
      )
      .run(
        now,
        now,
        now,
        now,
        now,
        now,
        now,
        now,
        now,
        now,
        now,
        now,
        now,
        now,
      );
    connection.sqlite
      .prepare(
        `INSERT INTO knowledge_source_links
         (id, article_id, source_kind, support_case_id, captured_at, snapshot_text, created_at)
         VALUES ('preserved-case-source', 'article-linked-source', 'support_case', 'case-source-linked',
                 '2026-08-27T09:00:00.000Z', 'Original private case snapshot', '2026-08-27T09:01:00.000Z')`,
      )
      .run();
    copyMigration("0006_knowledge_only_provenance.sql", migrations);

    expect(runMigrations(connection.sqlite, migrations).applied).toEqual([
      "0006_knowledge_only_provenance.sql",
    ]);

    const tables = connection.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).not.toContain("support_cases");
    expect(
      connection.sqlite
        .prepare(
          "SELECT source_kind, source_title, snapshot_text FROM knowledge_source_links WHERE article_id='article-1' ORDER BY source_kind",
        )
        .all(),
    ).toEqual([
      {
        source_kind: "external",
        source_title: "Legacy support case CASE-1 — Linked case",
        snapshot_text: expect.stringContaining("Linked resolution"),
      },
      {
        source_kind: "internal",
        source_title: "Created in DejaView",
        snapshot_text: null,
      },
    ]);
    expect(
      connection.sqlite
        .prepare(
          "SELECT source_label FROM search_documents WHERE entity_id='article-1'",
        )
        .get(),
    ).toEqual({ source_label: "DejaView knowledge" });
    expect(
      connection.sqlite
        .prepare(
          "SELECT source_kind, external_item_key, external_url, source_title, captured_at, snapshot_text, created_at FROM knowledge_source_links WHERE article_id='article-external'",
        )
        .get(),
    ).toEqual({
      source_kind: "external",
      external_item_key: "SUP-9",
      external_url: "https://tenant.atlassian.net/browse/SUP-9",
      source_title: "Configured Jira",
      captured_at: now,
      snapshot_text: "private snapshot",
      created_at: now,
    });
    expect(
      connection.sqlite
        .prepare(
          "SELECT source_label FROM search_documents WHERE entity_id='article-external'",
        )
        .get(),
    ).toEqual({ source_label: "Jira" });
    expect(
      connection.sqlite
        .prepare(
          `SELECT id, article_id, source_kind, external_source_id, external_item_key,
                  source_title, captured_at, snapshot_text, created_at
           FROM knowledge_source_links WHERE id='preserved-case-source'`,
        )
        .get(),
    ).toEqual({
      id: "preserved-case-source",
      article_id: "article-linked-source",
      source_kind: "external",
      external_source_id: null,
      external_item_key: "CASE-4",
      source_title: "Legacy support case CASE-4 — Provenance-linked case",
      captured_at: "2026-08-27T09:00:00.000Z",
      snapshot_text:
        "Original private case snapshot\nOccurred at: 2026-08-27T08:00:00.000Z",
      created_at: "2026-08-27T09:01:00.000Z",
    });
    expect(
      connection.sqlite
        .prepare(
          "SELECT count(*) count FROM knowledge_articles WHERE id='legacy-case:case-source-linked'",
        )
        .get(),
    ).toEqual({ count: 0 });
    expect(
      connection.sqlite
        .prepare(
          "SELECT status, problem FROM knowledge_articles WHERE stable_key='KB-LEGACY-CASE-2'",
        )
        .get(),
    ).toEqual({ status: "draft", problem: "Open details" });
    expect(
      connection.sqlite
        .prepare(
          `SELECT d.source_label, l.snapshot_text
           FROM search_documents d
           JOIN knowledge_source_links l ON l.article_id=d.entity_id
           WHERE d.entity_id='legacy-case:case-open'`,
        )
        .get(),
    ).toEqual({
      source_label: "Legacy source",
      snapshot_text: expect.stringContaining(`Occurred at: ${now}`),
    });
    expect(
      connection.sqlite
        .prepare(
          "SELECT instruction FROM knowledge_steps WHERE article_id='legacy-case:case-open'",
        )
        .get(),
    ).toEqual({ instruction: "Resolution not yet documented." });
    expect(
      connection.sqlite
        .prepare(
          "SELECT status, published_at FROM knowledge_articles WHERE stable_key='KB-LEGACY-CASE-3'",
        )
        .get(),
    ).toEqual({ status: "published", published_at: now });
    expect(
      connection.sqlite
        .prepare("SELECT DISTINCT entity_type FROM search_documents")
        .all(),
    ).toEqual([{ entity_type: "article" }]);
    expect(
      connection.sqlite
        .prepare("SELECT count(*) count FROM search_documents")
        .get(),
    ).toEqual({ count: 5 });
    expect(
      connection.sqlite
        .prepare("SELECT count(*) count FROM search_documents_fts")
        .get(),
    ).toEqual({ count: 5 });
    expect(connection.sqlite.pragma("foreign_key_check")).toEqual([]);
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
