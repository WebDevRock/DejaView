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
    expect(prepare.mock.calls.length).toBeLessThanOrEqual(5);
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
      body: expect.stringContaining("Invoke-Sqlcmd"),
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
