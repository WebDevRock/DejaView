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
import { seedSampleData, SAMPLE_IDS } from "@/infrastructure/db/seed";
import { SqliteKnowledgeArticleRepository } from "@/infrastructure/db/knowledge-article-repository";
import { SqliteExternalPromotionRepository } from "@/infrastructure/db/external-promotion-repository";
import { KnowledgeService } from "@/application/articles/knowledge-service";
import type { KnowledgeSourceProvider } from "@/domain/sources/provider";
import { PromoteExternalItemService } from "@/application/sources/promote-external-item";

let directory = "";
let connection: DatabaseConnection;
beforeEach(() => {
  directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "dejaview-jira-promotion-"),
  );
  connection = openDatabase(path.join(directory, "test.sqlite"));
  runMigrations(connection.sqlite, path.resolve(process.cwd(), "migrations"));
  seedSampleData(connection.sqlite);
});
afterEach(() => {
  connection.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("Jira promotion", () => {
  it("freshly fetches a Jira issue, creates one draft with generic provenance and excludes comments", async () => {
    let fetches = 0;
    const provider = {
      id: "jira",
      label: "Support Jira",
      provenance: {
        providerType: "jira",
        secretEnvRef: "JIRA_API_TOKEN",
        promotionGuidance:
          "Review this captured Jira issue and document the verified resolution.",
      },
      capabilities: {
        search: true,
        itemDetail: true,
        comments: true,
        supportedFilters: ["project", "date"],
      },
      search: async () => [],
      getItem: async () => {
        fetches++;
        return {
          id: "jira:SUP-42",
          externalKey: "SUP-42",
          title: "Payroll printer fails",
          snippet: "",
          url: "https://tenant.atlassian.net/browse/SUP-42",
          sourceId: "jira",
          sourceLabel: "Support Jira",
          status: "open",
          score: 1,
          updatedAt: "2026-08-28T10:00:00Z",
          metadata: { projectKey: "SUP", projectName: "Payroll" },
          content: [],
          plainText: "Description without comments",
        };
      },
    } satisfies KnowledgeSourceProvider;
    const knowledge = new KnowledgeService(
      new SqliteKnowledgeArticleRepository(connection),
    );
    const service = new PromoteExternalItemService(
      provider,
      new SqliteExternalPromotionRepository(connection, knowledge),
    );
    const actor = {
      id: SAMPLE_IDS.user,
      displayName: "User",
      role: "editor" as const,
    };
    const first = await service.promote("SUP-42", actor);
    const second = await service.promote("SUP-42", actor);
    expect(fetches).toBe(2);
    expect(second).toEqual({ articleId: first.articleId, duplicate: true });
    const article = knowledge.get(first.articleId);
    expect(article).toMatchObject({
      status: "Draft",
      title: "Payroll printer fails",
      applications: [{ key: "payroll", name: "Payroll" }],
    });
    const provenance = connection.sqlite
      .prepare(
        "SELECT source_kind, external_item_key, source_title, snapshot_text FROM knowledge_source_links WHERE article_id = ?",
      )
      .get(first.articleId);
    expect(provenance).toEqual({
      source_kind: "external_item",
      external_item_key: "SUP-42",
      source_title: "Payroll printer fails",
      snapshot_text: "Description without comments",
    });
    expect(JSON.stringify(provenance)).not.toContain("comment body");
    expect(
      connection.sqlite
        .prepare(
          "SELECT provider_type, secret_env_ref FROM external_sources WHERE id = ?",
        )
        .get("jira"),
    ).toEqual({
      provider_type: "jira",
      secret_env_ref: "JIRA_API_TOKEN",
    });
  });

  it("persists generic provider provenance without Jira defaults", () => {
    const knowledge = new KnowledgeService(
      new SqliteKnowledgeArticleRepository(connection),
    );
    const repository = new SqliteExternalPromotionRepository(
      connection,
      knowledge,
    );
    repository.promote(
      {
        id: "tracker:INC-1",
        externalKey: "INC-1",
        title: "Generic incident",
        snippet: "",
        url: "https://tracker.example/items/INC-1",
        sourceId: "tracker",
        sourceLabel: "Incident tracker",
        status: "open",
        score: 1,
        updatedAt: "2026-08-28T10:00:00Z",
        metadata: {},
        content: [],
        plainText: "Generic details",
      },
      { id: SAMPLE_IDS.user, displayName: "User", role: "editor" },
      {
        providerType: "ticketing",
        secretEnvRef: "TRACKER_TOKEN",
        promotionGuidance: "Verify and document the incident resolution.",
      },
    );
    expect(
      connection.sqlite
        .prepare(
          "SELECT provider_type, secret_env_ref FROM external_sources WHERE id = ?",
        )
        .get("tracker"),
    ).toEqual({
      provider_type: "ticketing",
      secret_env_ref: "TRACKER_TOKEN",
    });
  });
});
