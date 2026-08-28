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
import { SAMPLE_IDS, seedSampleData } from "@/infrastructure/db/seed";
import { repairSearchProjection } from "@/infrastructure/search/projection-repair";
import { seedSampleData as seedSampleDataCli } from "../../scripts/scripts-safe/seed";

const connections: DatabaseConnection[] = [];
const directories: string[] = [];
const sampleTime = "2026-08-28T09:15:00.000Z";

function database(): DatabaseConnection {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dejaview-seed-"));
  directories.push(directory);
  const connection = openDatabase(path.join(directory, "seed.sqlite"));
  connections.push(connection);
  runMigrations(connection.sqlite, path.resolve(process.cwd(), "migrations"));
  return connection;
}

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe("sample seed", () => {
  it("creates the complete deterministic demo dataset", () => {
    const connection = database();

    seedSampleData(connection.sqlite);

    expect(connection.sqlite.prepare("SELECT * FROM users").all()).toEqual([
      {
        id: SAMPLE_IDS.user,
        external_subject: "local-development-user",
        display_name: "Local DejaView User",
        email: "local@dejaview.invalid",
        status: "active",
        created_at: sampleTime,
        updated_at: sampleTime,
      },
    ]);
    expect(
      connection.sqlite.prepare("SELECT * FROM applications").all(),
    ).toEqual([
      {
        id: SAMPLE_IDS.application,
        key: "print-service",
        name: "Print Service",
        description: "Example application",
        created_at: sampleTime,
        updated_at: sampleTime,
      },
    ]);
    expect(connection.sqlite.prepare("SELECT * FROM tags").all()).toEqual([
      {
        id: SAMPLE_IDS.tag,
        slug: "printer",
        name: "Printer",
        created_at: sampleTime,
        updated_at: sampleTime,
      },
    ]);
    expect(
      connection.sqlite.prepare("SELECT * FROM knowledge_articles").all(),
    ).toEqual([
      {
        id: SAMPLE_IDS.article,
        stable_key: "KB-EXAMPLE-001",
        title: "Resolve printer error E42",
        summary: "Deterministic sample article",
        problem: "Printer cannot start a job",
        symptoms: "Error E42 appears on the display",
        resolution_summary: "Replace the damaged USB cable",
        status: "draft",
        version: 1,
        use_count: 0,
        last_used_at: null,
        created_by_user_id: SAMPLE_IDS.user,
        updated_by_user_id: SAMPLE_IDS.user,
        published_by_user_id: null,
        published_at: null,
        created_at: sampleTime,
        updated_at: sampleTime,
      },
    ]);
    expect(
      connection.sqlite.prepare("SELECT * FROM knowledge_steps").all(),
    ).toEqual([
      {
        id: SAMPLE_IDS.step,
        article_id: SAMPLE_IDS.article,
        stable_key: "replace-cable",
        position: 0,
        step_type: "instruction",
        title: "Replace the cable",
        instruction: "Replace the damaged USB cable.",
        code: null,
        notes: null,
        body_ast_json: JSON.stringify({
          version: 1,
          type: "document",
          children: [
            { type: "paragraph", text: "Replace the damaged USB cable." },
          ],
        }),
        body_plain_text: "Replace the damaged USB cable.",
        created_at: sampleTime,
        updated_at: sampleTime,
      },
    ]);
    expect(
      connection.sqlite.prepare("SELECT * FROM article_applications").all(),
    ).toEqual([
      {
        article_id: SAMPLE_IDS.article,
        application_id: SAMPLE_IDS.application,
        created_at: sampleTime,
      },
    ]);
    expect(
      connection.sqlite.prepare("SELECT * FROM article_tags").all(),
    ).toEqual([
      {
        article_id: SAMPLE_IDS.article,
        tag_id: SAMPLE_IDS.tag,
        created_at: sampleTime,
      },
    ]);
    expect(
      connection.sqlite.prepare("SELECT * FROM search_documents").all(),
    ).toEqual([
      {
        id: SAMPLE_IDS.searchDocument,
        entity_type: "article",
        entity_id: SAMPLE_IDS.article,
        source_label: "Knowledge",
        title: "Resolve printer error E42",
        body: "Replace the damaged USB cable.",
        exact_terms: "E42",
        status: "draft",
        updated_at: sampleTime,
      },
    ]);
    expect(
      connection.sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM search_documents_fts WHERE search_documents_fts MATCH 'E42'",
        )
        .get(),
    ).toEqual({ count: 1 });
  });

  it("restores exact demo values after reruns and drift", () => {
    const connection = database();
    seedSampleData(connection.sqlite);
    connection.sqlite
      .prepare("UPDATE users SET display_name = 'Drifted', status = 'disabled'")
      .run();
    connection.sqlite
      .prepare(
        "UPDATE knowledge_articles SET title = 'Drifted', use_count = 99",
      )
      .run();
    connection.sqlite
      .prepare("UPDATE knowledge_steps SET instruction = 'Drifted'")
      .run();
    connection.sqlite
      .prepare("UPDATE search_documents SET exact_terms = 'DRIFT'")
      .run();
    connection.sqlite.prepare("DELETE FROM article_tags").run();

    seedSampleData(connection.sqlite);
    seedSampleData(connection.sqlite);

    expect(
      connection.sqlite
        .prepare("SELECT display_name, status FROM users WHERE id = ?")
        .get(SAMPLE_IDS.user),
    ).toEqual({
      display_name: "Local DejaView User",
      status: "active",
    });
    expect(
      connection.sqlite
        .prepare("SELECT title, use_count FROM knowledge_articles WHERE id = ?")
        .get(SAMPLE_IDS.article),
    ).toEqual({
      title: "Resolve printer error E42",
      use_count: 0,
    });
    expect(
      connection.sqlite
        .prepare("SELECT instruction FROM knowledge_steps WHERE id = ?")
        .get(SAMPLE_IDS.step),
    ).toEqual({
      instruction: "Replace the damaged USB cable.",
    });
    expect(
      connection.sqlite
        .prepare("SELECT exact_terms FROM search_documents WHERE id = ?")
        .get(SAMPLE_IDS.searchDocument),
    ).toEqual({ exact_terms: "E42" });
    expect(
      connection.sqlite
        .prepare("SELECT COUNT(*) AS count FROM article_tags")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      connection.sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM search_documents_fts WHERE search_documents_fts MATCH 'E42'",
        )
        .get(),
    ).toEqual({ count: 1 });
  });

  it.each([
    ["runtime to runtime", seedSampleData, seedSampleData],
    ["runtime to CLI-safe", seedSampleData, seedSampleDataCli],
    ["CLI-safe to runtime", seedSampleDataCli, seedSampleData],
    ["CLI-safe to CLI-safe", seedSampleDataCli, seedSampleDataCli],
  ])(
    "restores the exact deterministic projection after reindex (%s)",
    (_name, initialSeed, rerunSeed) => {
      const connection = database();
      initialSeed(connection.sqlite);
      connection.sqlite
        .prepare(
          `INSERT INTO users
          (id, external_subject, display_name, email, status, created_at, updated_at)
          VALUES ('unrelated-user', 'unrelated', 'Unrelated User', 'user@example.invalid', 'active', ?, ?)`,
        )
        .run(sampleTime, sampleTime);

      repairSearchProjection(connection.sqlite);
      expect(
        connection.sqlite
          .prepare(
            "SELECT id FROM search_documents WHERE entity_type = 'article' AND entity_id = ?",
          )
          .get(SAMPLE_IDS.article),
      ).toEqual({ id: `article:${SAMPLE_IDS.article}` });

      rerunSeed(connection.sqlite);

      expect(
        connection.sqlite
          .prepare(
            "SELECT * FROM search_documents WHERE entity_type = 'article' AND entity_id = ?",
          )
          .all(SAMPLE_IDS.article),
      ).toEqual([
        {
          id: SAMPLE_IDS.searchDocument,
          entity_type: "article",
          entity_id: SAMPLE_IDS.article,
          source_label: "Knowledge",
          title: "Resolve printer error E42",
          body: "Replace the damaged USB cable.",
          exact_terms: "E42",
          status: "draft",
          updated_at: sampleTime,
        },
      ]);
      expect(
        connection.sqlite
          .prepare("SELECT * FROM users WHERE id = 'unrelated-user'")
          .get(),
      ).toEqual({
        id: "unrelated-user",
        external_subject: "unrelated",
        display_name: "Unrelated User",
        email: "user@example.invalid",
        status: "active",
        created_at: sampleTime,
        updated_at: sampleTime,
      });
      expect(
        connection.sqlite
          .prepare(
            "SELECT COUNT(*) AS count FROM search_documents_fts WHERE search_documents_fts MATCH 'E42'",
          )
          .get(),
      ).toEqual({ count: 1 });
    },
  );

  it("rejects a conflicting natural key atomically", () => {
    const connection = database();
    connection.sqlite
      .prepare(
        `INSERT INTO applications (id, key, name, description, created_at, updated_at)
        VALUES ('other-app', 'print-service', 'Other app', '', ?, ?)`,
      )
      .run(sampleTime, sampleTime);

    expect(() => seedSampleData(connection.sqlite)).toThrow(
      /seed conflict.*applications.*print-service/i,
    );
    expect(
      connection.sqlite.prepare("SELECT COUNT(*) AS count FROM users").get(),
    ).toEqual({ count: 0 });
    expect(
      connection.sqlite
        .prepare("SELECT name FROM applications WHERE id = 'other-app'")
        .get(),
    ).toEqual({ name: "Other app" });
  });
});
