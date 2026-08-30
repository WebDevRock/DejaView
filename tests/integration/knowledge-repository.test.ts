// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeService } from "@/application/articles/knowledge-service";
import {
  openDatabase,
  type DatabaseConnection,
} from "@/infrastructure/db/client";
import { runMigrations } from "@/infrastructure/db/migrator";
import { SqliteKnowledgeArticleRepository } from "@/infrastructure/db/knowledge-article-repository";
import { repairSearchProjection } from "@/infrastructure/search/projection-repair";

const actor = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Local User",
  role: "editor" as const,
};
const resources: { connection: DatabaseConnection; directory: string }[] = [];
let count = 1000;

function fixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "dejaview-knowledge-"),
  );
  const connection = openDatabase(path.join(directory, "test.sqlite"));
  resources.push({ connection, directory });
  runMigrations(connection.sqlite, path.resolve(process.cwd(), "migrations"));
  connection.sqlite
    .prepare(
      `INSERT INTO users
    (id, external_subject, display_name, email, status, created_at, updated_at)
    VALUES (?, 'test-user', 'Local User', NULL, 'active', ?, ?)`,
    )
    .run(actor.id, "2026-08-28T12:00:00.000Z", "2026-08-28T12:00:00.000Z");
  const service = new KnowledgeService(
    new SqliteKnowledgeArticleRepository(connection),
    {
      now: () => "2026-08-28T12:00:00.000Z",
      id: () => `00000000-0000-4000-8000-${String(count++).padStart(12, "0")}`,
    },
  );
  return { connection, service };
}

afterEach(() => {
  for (const { connection, directory } of resources.splice(0)) {
    connection.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite knowledge repository", () => {
  it("lists multiple complete article DTOs with a bounded query count", () => {
    const { connection, service } = fixture();
    for (const problem of ["First", "Second", "Third"])
      service.quickCreate(
        {
          problem,
          whatFixedIt: `${problem} fix`,
          applications: [`${problem} application`],
          tags: [`${problem} tag`],
        },
        actor,
      );
    const prepare = vi.spyOn(connection.sqlite, "prepare");

    const articles = service.list();

    expect(articles).toHaveLength(3);
    expect(
      articles.map((article) => article.steps[0]!.instruction).sort(),
    ).toEqual(["First fix", "Second fix", "Third fix"]);
    expect(articles.every((article) => article.applications.length === 1)).toBe(
      true,
    );
    expect(articles.every((article) => article.tags.length === 1)).toBe(true);
    expect(prepare.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("atomically round-trips articles, ordered stable steps, edges, applications, tags and search projection", () => {
    const { connection, service } = fixture();
    const created = service.quickCreate(
      {
        problem: "Payroll export fails",
        symptomsOrError: "SQLSTATE 42P01",
        whatFixedIt: "Restore the view",
        applications: ["Payroll"],
        tags: ["Database"],
      },
      actor,
    );
    const secondId = `00000000-0000-4000-8000-${String(count++).padStart(12, "0")}`;
    const updated = service.update(
      created.id,
      {
        version: created.version,
        title: "Repair payroll export",
        summary: "Restore a missing database view",
        problem: created.problem,
        symptoms: created.symptoms,
        resolutionSummary: "Restore the view and verify it",
        steps: [
          {
            id: secondId,
            stableKey: "verify",
            position: 0,
            stepType: "sql",
            title: "Verify",
            instruction: "Run the query",
            code: "SELECT 1;",
            notes: null,
          },
          {
            id: created.steps[0]!.id,
            stableKey: created.steps[0]!.stableKey,
            position: 1,
            stepType: "powershell",
            title: "Restore",
            instruction: "Restore the view",
            code: "Invoke-Sqlcmd",
            notes: "Run as an administrator",
          },
        ],
        edges: [
          {
            fromStepId: secondId,
            toStepId: created.steps[0]!.id,
            edgeType: "branch",
            label: "If missing",
          },
        ],
        applications: ["Payroll", "Reporting"],
        tags: ["Database", "Export"],
      },
      actor,
    );

    expect(service.get(created.id)).toEqual(updated);
    expect(
      updated.steps.map(({ id, stableKey, position }) => ({
        id,
        stableKey,
        position,
      })),
    ).toEqual([
      { id: secondId, stableKey: "verify", position: 0 },
      {
        id: created.steps[0]!.id,
        stableKey: created.steps[0]!.stableKey,
        position: 1,
      },
    ]);
    expect(
      connection.sqlite
        .prepare(
          "SELECT title, status, body, exact_terms FROM search_documents WHERE entity_id = ?",
        )
        .get(created.id),
    ).toEqual({
      title: "Repair payroll export",
      status: "draft",
      body: expect.stringMatching(/Invoke-Sqlcmd[\s\S]*Reporting[\s\S]*Export/),
      exact_terms: expect.stringContaining("SQLSTATE 42P01"),
    });
    expect(
      connection.sqlite
        .prepare(
          "SELECT COUNT(*) count FROM search_documents_fts WHERE search_documents_fts MATCH 'Invoke' ",
        )
        .get(),
    ).toEqual({ count: 1 });
  });

  it("writes the identical complete article projection before and after repair", () => {
    const { connection, service } = fixture();
    const article = service.quickCreate(
      {
        problem: "Payroll export fails",
        symptomsOrError: "SQLSTATE 42P01",
        whatFixedIt: "Restore the reporting view with Invoke-Sqlcmd",
        applications: ["Payroll"],
        tags: ["Database"],
      },
      actor,
    );
    service.update(
      article.id,
      {
        version: article.version,
        title: article.title,
        summary: article.summary,
        problem: article.problem,
        symptoms: article.symptoms,
        resolutionSummary: article.resolutionSummary,
        steps: [
          {
            ...article.steps[0]!,
            instruction: "Distinct repair instruction",
            code: "DISTINCT_REPAIR_CODE();",
            notes: null,
          },
        ],
        edges: [],
        applications: article.applications.map((item) => item.name),
        tags: article.tags.map((item) => item.name),
      },
      actor,
    );
    const readProjection = () =>
      connection.sqlite
        .prepare("SELECT * FROM search_documents WHERE entity_id = ?")
        .get(article.id);
    const live = readProjection();
    expect(live).toMatchObject({
      body: expect.stringContaining("Distinct repair instruction"),
      exact_terms: expect.stringContaining("DISTINCT_REPAIR_CODE();"),
    });

    repairSearchProjection(connection.sqlite);

    expect(readProjection()).toEqual(live);
  });

  it("keeps providerless external and manual source labels stable across edits and reindex", () => {
    const { connection, service } = fixture();
    const providerless = service.quickCreate(
      { problem: "Legacy problem", whatFixedIt: "Legacy fix" },
      actor,
    );
    const manual = service.quickCreate(
      { problem: "Manual problem", whatFixedIt: "Manual fix" },
      actor,
    );
    connection.sqlite
      .prepare("DELETE FROM knowledge_source_links WHERE article_id IN (?, ?)")
      .run(providerless.id, manual.id);
    connection.sqlite
      .prepare(
        `INSERT INTO knowledge_source_links
         (id, article_id, source_kind, external_url, source_title, captured_at, created_at)
         VALUES
         ('legacy-source', ?, 'external', NULL, 'Legacy support case CASE-9', ?, ?),
         ('manual-source', ?, 'manual', 'https://example.test/note', NULL, ?, ?)`,
      )
      .run(
        providerless.id,
        providerless.updatedAt,
        providerless.updatedAt,
        manual.id,
        manual.updatedAt,
        manual.updatedAt,
      );
    const edit = (article: typeof providerless) =>
      service.update(
        article.id,
        {
          version: article.version,
          title: `${article.title} edited`,
          summary: article.summary,
          problem: article.problem,
          symptoms: article.symptoms,
          resolutionSummary: article.resolutionSummary,
          steps: article.steps,
          edges: article.edges.map(
            ({ fromStepId, toStepId, edgeType, label }) => ({
              fromStepId,
              toStepId,
              edgeType,
              label,
            }),
          ),
          applications: article.applications.map((item) => item.name),
          tags: article.tags.map((item) => item.name),
        },
        actor,
      );
    edit(providerless);
    edit(manual);
    const labels = () =>
      connection.sqlite
        .prepare(
          "SELECT entity_id, source_label FROM search_documents WHERE entity_id IN (?, ?) ORDER BY entity_id",
        )
        .all(manual.id, providerless.id);

    expect(labels()).toEqual([
      { entity_id: providerless.id, source_label: "Legacy source" },
      { entity_id: manual.id, source_label: "Manual source" },
    ]);

    repairSearchProjection(connection.sqlite);

    expect(labels()).toEqual([
      { entity_id: providerless.id, source_label: "Legacy source" },
      { entity_id: manual.id, source_label: "Manual source" },
    ]);
  });

  it("does not partially replace children when optimistic locking fails", () => {
    const { connection, service } = fixture();
    const created = service.quickCreate(
      { problem: "Problem", whatFixedIt: "Fix" },
      actor,
    );
    connection.sqlite
      .prepare("UPDATE knowledge_articles SET version = 2 WHERE id = ?")
      .run(created.id);

    expect(() =>
      service.update(
        created.id,
        {
          version: 1,
          title: "Changed",
          summary: "",
          problem: "Problem",
          symptoms: "",
          resolutionSummary: "Fix",
          steps: [
            {
              ...created.steps[0]!,
              instruction: "Changed",
              code: null,
              notes: null,
            },
          ],
          edges: [],
          applications: [],
          tags: [],
        },
        actor,
      ),
    ).toThrow(/stale/i);
    expect(
      connection.sqlite
        .prepare("SELECT instruction FROM knowledge_steps WHERE article_id = ?")
        .get(created.id),
    ).toEqual({ instruction: "Fix" });
    expect(
      connection.sqlite
        .prepare("SELECT title FROM search_documents WHERE entity_id = ?")
        .get(created.id),
    ).toEqual({ title: "Problem" });
  });
});
