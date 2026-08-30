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

describe("knowledge-only sample seed", () => {
  it("creates one deterministic published article with internal provenance and FTS", () => {
    const connection = database();
    seedSampleData(connection.sqlite);
    expect(
      connection.sqlite
        .prepare("SELECT id, stable_key, status FROM knowledge_articles")
        .all(),
    ).toEqual([
      {
        id: SAMPLE_IDS.article,
        stable_key: "KB-EXAMPLE-001",
        status: "published",
      },
    ]);
    expect(
      connection.sqlite
        .prepare(
          "SELECT source_kind, source_title, snapshot_text FROM knowledge_source_links",
        )
        .all(),
    ).toEqual([
      {
        source_kind: "internal",
        source_title: "Created in DejaView",
        snapshot_text: null,
      },
    ]);
    expect(
      connection.sqlite.prepare("SELECT * FROM search_documents").all(),
    ).toEqual([
      {
        id: SAMPLE_IDS.searchDocument,
        entity_type: "article",
        entity_id: SAMPLE_IDS.article,
        source_label: "DejaView knowledge",
        title: "Resolve printer error E42",
        body: "A desktop printer cannot start a job. Error E42 appears on the display. Replace the damaged USB cable.",
        exact_terms: "E42",
        status: "published",
        updated_at: sampleTime,
      },
    ]);
    expect(
      connection.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM search_documents_fts WHERE search_documents_fts MATCH 'E42'",
        )
        .get(),
    ).toEqual({ count: 1 });
    expect(connection.sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("restores exact demo values after reruns and drift", () => {
    const connection = database();
    seedSampleData(connection.sqlite);
    connection.sqlite
      .prepare("UPDATE knowledge_articles SET title='Drifted', use_count=99")
      .run();
    connection.sqlite
      .prepare("UPDATE search_documents SET exact_terms='DRIFT'")
      .run();
    connection.sqlite.prepare("DELETE FROM article_tags").run();
    seedSampleData(connection.sqlite);
    seedSampleData(connection.sqlite);
    expect(
      connection.sqlite
        .prepare("SELECT title,use_count FROM knowledge_articles WHERE id=?")
        .get(SAMPLE_IDS.article),
    ).toEqual({ title: "Resolve printer error E42", use_count: 2 });
    expect(
      connection.sqlite
        .prepare("SELECT exact_terms FROM search_documents WHERE id=?")
        .get(SAMPLE_IDS.searchDocument),
    ).toEqual({ exact_terms: "E42" });
    expect(
      connection.sqlite
        .prepare("SELECT COUNT(*) count FROM article_tags")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      connection.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM search_documents_fts WHERE search_documents_fts MATCH 'E42'",
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
    "keeps runtime and CLI-safe seeds equivalent (%s)",
    (_name, initialSeed, rerunSeed) => {
      const connection = database();
      initialSeed(connection.sqlite);
      repairSearchProjection(connection.sqlite);
      rerunSeed(connection.sqlite);
      expect(
        connection.sqlite
          .prepare("SELECT id,entity_type,source_label FROM search_documents")
          .all(),
      ).toEqual([
        {
          id: SAMPLE_IDS.searchDocument,
          entity_type: "article",
          source_label: "DejaView knowledge",
        },
      ]);
    },
  );

  it("rejects a conflicting natural key atomically", () => {
    const connection = database();
    connection.sqlite
      .prepare(
        "INSERT INTO applications VALUES ('other','print-service','Other','','2026','2026')",
      )
      .run();
    expect(() => seedSampleData(connection.sqlite)).toThrow(
      /seed conflict.*applications.*print-service/i,
    );
    expect(
      connection.sqlite.prepare("SELECT COUNT(*) count FROM users").get(),
    ).toEqual({ count: 0 });
  });
});
