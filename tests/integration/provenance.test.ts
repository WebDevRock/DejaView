// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  openDatabase,
  type DatabaseConnection,
} from "@/infrastructure/db/client";
import { runMigrations } from "@/infrastructure/db/migrator";
import { SAMPLE_IDS, seedSampleData } from "@/infrastructure/db/seed";

const time = "2026-08-28T09:15:00.000Z";
let connection: DatabaseConnection;
let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "dejaview-provenance-"));
  connection = openDatabase(path.join(directory, "test.sqlite"));
  runMigrations(connection.sqlite, path.resolve(process.cwd(), "migrations"));
  seedSampleData(connection.sqlite);
});

afterEach(() => {
  connection.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function insertSupportCase(): void {
  connection.sqlite
    .prepare(
      `INSERT INTO support_cases
      (id, stable_key, title, description, occurred_at, status, created_by_user_id, created_at, updated_at)
      VALUES ('case-1', 'CASE-1', 'Printer case', 'E42 occurred', ?, 'open', ?, ?, ?)`,
    )
    .run(time, SAMPLE_IDS.user, time, time);
}

function insertExternalSource(): void {
  connection.sqlite
    .prepare(
      `INSERT INTO external_sources
      (id, provider_type, name, base_url, secret_env_ref, created_at, updated_at)
      VALUES ('source-1', 'jira', 'Support Jira', 'https://jira.example.test', 'JIRA_TOKEN', ?, ?)`,
    )
    .run(time, time);
}

function insertSourceLink(values: {
  id: string;
  sourceKind: "support_case" | "external_item" | "manual";
  supportCaseId?: string | null;
  externalSourceId?: string | null;
  externalItemKey?: string | null;
  externalUrl?: string | null;
  sourceTitle?: string | null;
}): void {
  connection.sqlite
    .prepare(
      `INSERT INTO knowledge_source_links
      (id, article_id, source_kind, support_case_id, external_source_id, external_item_key,
       external_url, source_title, captured_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      values.id,
      SAMPLE_IDS.article,
      values.sourceKind,
      values.supportCaseId ?? null,
      values.externalSourceId ?? null,
      values.externalItemKey ?? null,
      values.externalUrl ?? null,
      values.sourceTitle ?? null,
      time,
      time,
    );
}

describe("knowledge source provenance", () => {
  it("restricts deletion of a support case or external source used by provenance", () => {
    insertSupportCase();
    insertExternalSource();
    insertSourceLink({
      id: "link-case",
      sourceKind: "support_case",
      supportCaseId: "case-1",
    });
    insertSourceLink({
      id: "link-external",
      sourceKind: "external_item",
      externalSourceId: "source-1",
      externalItemKey: "SUP-42",
      externalUrl: "https://jira.example.test/browse/SUP-42",
    });

    expect(() =>
      connection.sqlite
        .prepare("DELETE FROM support_cases WHERE id = 'case-1'")
        .run(),
    ).toThrow(/foreign key constraint/i);
    expect(() =>
      connection.sqlite
        .prepare("DELETE FROM external_sources WHERE id = 'source-1'")
        .run(),
    ).toThrow(/foreign key constraint/i);
    expect(
      connection.sqlite
        .prepare("SELECT COUNT(*) AS count FROM knowledge_source_links")
        .get(),
    ).toEqual({ count: 2 });
  });

  it("requires only fields relevant to each source kind", () => {
    insertSupportCase();
    insertExternalSource();

    expect(() =>
      insertSourceLink({
        id: "invalid-case",
        sourceKind: "support_case",
        supportCaseId: "case-1",
        externalUrl: "https://irrelevant.example.test",
      }),
    ).toThrow(/check constraint/i);
    expect(() =>
      insertSourceLink({
        id: "invalid-external",
        sourceKind: "external_item",
        supportCaseId: "case-1",
        externalSourceId: "source-1",
        externalItemKey: "SUP-42",
        externalUrl: "https://jira.example.test/browse/SUP-42",
      }),
    ).toThrow(/check constraint/i);
    expect(() =>
      insertSourceLink({ id: "invalid-manual", sourceKind: "manual" }),
    ).toThrow(/check constraint/i);

    insertSourceLink({
      id: "manual-url",
      sourceKind: "manual",
      externalUrl: "https://manual.example.test",
    });
    insertSourceLink({
      id: "manual-title",
      sourceKind: "manual",
      sourceTitle: "Engineer interview",
    });
  });
});
