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
import { SqliteKnowledgeArticleRepository } from "@/infrastructure/db/knowledge-article-repository";
import { KnowledgeService } from "@/application/articles/knowledge-service";
import { ArticleUsefulnessService } from "@/application/articles/article-usefulness-service";
import { RelatedArticleService } from "@/application/articles/related-article-service";

const actor = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Editor",
  role: "editor" as const,
};
const resources: { connection: DatabaseConnection; directory: string }[] = [];
let sequence = 100;
function fixture() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "dejaview-knowledge-"),
  );
  const connection = openDatabase(path.join(directory, "test.sqlite"));
  resources.push({ connection, directory });
  runMigrations(connection.sqlite, path.resolve(process.cwd(), "migrations"));
  const now = "2026-08-28T15:00:00.000Z";
  connection.sqlite
    .prepare(
      "INSERT INTO users (id, display_name, status, created_at, updated_at) VALUES (?, 'Editor', 'active', ?, ?)",
    )
    .run(actor.id, now, now);
  const runtime = {
    now: () => now,
    id: () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`,
  };
  const articleRepository = new SqliteKnowledgeArticleRepository(connection);
  const articles = new KnowledgeService(articleRepository, runtime);
  return {
    connection,
    articles,
    usefulness: new ArticleUsefulnessService(articleRepository, runtime),
    related: new RelatedArticleService(articleRepository),
  };
}
afterEach(() => {
  for (const item of resources.splice(0)) {
    item.connection.close();
    fs.rmSync(item.directory, { recursive: true, force: true });
  }
});

describe("knowledge usefulness and relationships", () => {
  it("records yes and no feedback while only yes increments use count", () => {
    const { connection, articles, usefulness } = fixture();
    const article = articles.quickCreate(
      { problem: "Export failed", whatFixedIt: "Restore view" },
      actor,
    );
    usefulness.record(
      article.id,
      { outcome: "no", differenceNote: "Different schema" },
      actor,
    );
    expect(articles.get(article.id).useCount).toBe(0);
    connection.sqlite
      .prepare("UPDATE knowledge_articles SET updated_at=? WHERE id=?")
      .run("2026-08-27T00:00:00.000Z", article.id);
    connection.sqlite
      .prepare("UPDATE search_documents SET updated_at=? WHERE entity_id=?")
      .run("2026-08-27T00:00:00.000Z", article.id);
    usefulness.record(article.id, { outcome: "yes" }, actor);
    expect(articles.get(article.id)).toMatchObject({
      useCount: 1,
      lastUsedAt: "2026-08-28T15:00:00.000Z",
      updatedAt: "2026-08-28T15:00:00.000Z",
    });
    expect(usefulness.history(article.id)).toHaveLength(2);
    expect(
      connection.sqlite
        .prepare("SELECT updated_at FROM search_documents WHERE entity_id=?")
        .get(article.id),
    ).toEqual({ updated_at: "2026-08-28T15:00:00.000Z" });
  });

  it("ranks published related articles by shared applications then tags with reasons", () => {
    const { articles, related } = fixture();
    const source = articles.quickCreate(
      {
        problem: "Payroll export",
        whatFixedIt: "Fix",
        applications: ["Payroll"],
        tags: ["Export"],
      },
      actor,
    );
    const appMatch = articles.quickCreate(
      {
        problem: "Payroll issue",
        whatFixedIt: "Fix",
        applications: ["Payroll"],
      },
      actor,
    );
    const tagMatch = articles.quickCreate(
      { problem: "Other issue", whatFixedIt: "Fix", tags: ["Export"] },
      actor,
    );
    for (const item of [source, appMatch, tagMatch])
      articles.publish(item.id, item.version, actor);
    expect(
      related
        .forArticle(source.id)
        .map(({ article, reasons }) => [article.id, reasons[0]]),
    ).toEqual([
      [appMatch.id, "Shared application: Payroll"],
      [tagMatch.id, "Shared tag: Export"],
    ]);
  });
});
