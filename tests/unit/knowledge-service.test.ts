import { describe, expect, it } from "vitest";
import {
  KnowledgeService,
  type KnowledgeArticleRepository,
} from "@/application/articles/knowledge-service";
import type { KnowledgeArticle } from "@/domain/knowledge/article";

class MemoryRepository implements KnowledgeArticleRepository {
  articles = new Map<string, KnowledgeArticle>();
  create(article: KnowledgeArticle) {
    this.articles.set(article.id, article);
    return article;
  }
  list() {
    return [...this.articles.values()];
  }
  get(id: string) {
    return this.articles.get(id) ?? null;
  }
  update(article: KnowledgeArticle, expectedVersion: number) {
    const current = this.articles.get(article.id);
    if (!current || current.version !== expectedVersion) return null;
    this.articles.set(article.id, article);
    return article;
  }
}

const actor = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Local User",
  role: "editor" as const,
};
let counter = 100;
const serviceFor = (repository: MemoryRepository) =>
  new KnowledgeService(repository, {
    now: () => "2026-08-28T12:00:00.000Z",
    id: () => `00000000-0000-4000-8000-${String(counter++).padStart(12, "0")}`,
  });

describe("KnowledgeService", () => {
  it("quick creates, lists, updates and publishes through a repository port", () => {
    const repository = new MemoryRepository();
    const service = serviceFor(repository);
    const created = service.quickCreate(
      { problem: "Export fails", whatFixedIt: "Restart it" },
      actor,
    );
    expect(service.list()).toEqual([created]);

    const updated = service.update(
      created.id,
      {
        version: 1,
        title: "Fix export",
        summary: "Known fix",
        problem: "Export fails",
        symptoms: "E42",
        resolutionSummary: "Restart it",
        steps: created.steps.map((step) => ({
          id: step.id,
          stableKey: step.stableKey,
          position: step.position,
          stepType: "sql",
          title: "Verify data",
          instruction: "Run the query",
          code: "SELECT 1;",
          notes: null,
        })),
        edges: [],
        applications: ["Payroll"],
        tags: ["Database"],
      },
      actor,
    );
    expect(updated.version).toBe(2);
    expect(updated.steps[0]?.id).toBe(created.steps[0]?.id);

    const published = service.publish(created.id, 2, actor);
    expect(published).toMatchObject({
      status: "Published",
      version: 3,
      publishedByUserId: actor.id,
    });
    expect(service.get(created.id)).toEqual(published);
  });
});
