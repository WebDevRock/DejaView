import "server-only";
import type {
  ExternalPromotionRepository,
  ExternalPromotionResult,
} from "../../application/sources/promote-external-item";
import type { KnowledgeService } from "../../application/articles/knowledge-service";
import type { ActorIdentity } from "../../domain/identity/actor";
import {
  ProviderError,
  type ProviderItem,
  type ProviderProvenance,
  type SelectedProviderComment,
} from "../../domain/sources/provider";
import type { DatabaseConnection } from "./client";
import { externalSourceLabel } from "./external-source-label";

export class SqliteExternalPromotionRepository implements ExternalPromotionRepository {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly knowledge: KnowledgeService,
  ) {}
  findExisting(
    sourceId: string,
    externalKey: string,
  ): ExternalPromotionResult | null {
    const existing = this.connection.sqlite
      .prepare(
        `SELECT article_id AS articleId FROM knowledge_source_links WHERE source_kind = 'external' AND external_source_id = ? AND external_item_key = ?`,
      )
      .get(sourceId, externalKey) as { articleId: string } | undefined;
    return existing ? { articleId: existing.articleId, duplicate: true } : null;
  }
  promote(
    item: ProviderItem,
    actor: ActorIdentity,
    provenance: ProviderProvenance,
    comments: readonly SelectedProviderComment[],
  ): ExternalPromotionResult {
    return this.connection.sqlite.transaction(() => {
      const existing = this.connection.sqlite
        .prepare(
          `SELECT article_id AS articleId FROM knowledge_source_links WHERE source_kind = 'external' AND external_source_id = ? AND external_item_key = ?`,
        )
        .get(item.sourceId, item.externalKey) as
        { articleId: string } | undefined;
      if (existing) {
        if (comments.length > 0)
          throw new ProviderError(
            "promotion_conflict",
            false,
            "Selected comments cannot be added to an existing Jira draft",
          );
        return { articleId: existing.articleId, duplicate: true };
      }
      const now = new Date().toISOString();
      this.connection.sqlite
        .prepare(
          `INSERT INTO external_sources (id, provider_type, name, enabled, base_url, config_json, secret_env_ref, created_at, updated_at) VALUES (?, ?, ?, 1, ?, '{}', ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
        )
        .run(
          item.sourceId,
          provenance.providerType,
          item.sourceLabel,
          new URL(item.url).origin,
          provenance.secretEnvRef,
          now,
          now,
        );
      const persistedSource = this.connection.sqlite
        .prepare(
          "SELECT provider_type AS providerType, name FROM external_sources WHERE id = ?",
        )
        .get(item.sourceId) as { providerType: string; name: string };
      const sourceLabel = externalSourceLabel(
        persistedSource.providerType,
        persistedSource.name,
      );
      const project =
        typeof item.metadata.projectName === "string"
          ? item.metadata.projectName
          : typeof item.metadata.projectKey === "string"
            ? item.metadata.projectKey
            : undefined;
      const contextComments = comments
        .filter((comment) => comment.mapping === "context")
        .map(formatContextComment);
      const problem = joinSections(
        [item.title, item.plainText, ...contextComments].filter(Boolean),
      );
      const snapshot = joinSections([
        item.plainText,
        ...comments.map(formatSnapshotComment),
      ]);
      if (problem.length > 20_000 || snapshot.length > 20_000)
        throw new ProviderError(
          "invalid_request",
          false,
          "Selected Jira content exceeds the import limit",
        );
      const created = this.knowledge.quickCreate(
        {
          problem,
          whatFixedIt: provenance.promotionGuidance,
          applications: project ? [project] : [],
        },
        actor,
      );
      const article = this.knowledge.update(
        created.id,
        {
          version: created.version,
          title: item.title.slice(0, 120),
          summary: "",
          problem,
          symptoms: "",
          resolutionSummary: created.resolutionSummary,
          steps: [
            ...created.steps,
            ...comments
              .filter((comment) => comment.mapping === "step")
              .map((comment, index) => ({
                position: created.steps.length + index,
                stepType: "instruction" as const,
                title: commentLabel(comment),
                instruction: sanitisePlainText(comment.plainText),
                code: null,
                notes: null,
              })),
          ],
          edges: [],
          applications: project ? [project] : [],
          tags: [],
        },
        actor,
      );
      this.connection.sqlite
        .prepare(
          "DELETE FROM knowledge_source_links WHERE article_id = ? AND source_kind = 'internal'",
        )
        .run(article.id);
      this.connection.sqlite
        .prepare(
          `INSERT INTO knowledge_source_links (id, article_id, source_kind, external_source_id, external_item_key, external_url, source_title, captured_at, snapshot_text, created_at) VALUES (?, ?, 'external', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          crypto.randomUUID(),
          article.id,
          item.sourceId,
          item.externalKey,
          item.url,
          item.title,
          now,
          snapshot,
          now,
        );
      this.connection.sqlite
        .prepare(
          "UPDATE search_documents SET source_label = ? WHERE entity_type = 'article' AND entity_id = ?",
        )
        .run(sourceLabel, article.id);
      return { articleId: article.id, duplicate: false };
    })();
  }
}

function sanitisePlainText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function commentLabel(comment: SelectedProviderComment): string {
  const author = sanitisePlainText(comment.author).slice(0, 200) || "Unknown";
  const createdAt = sanitisePlainText(comment.createdAt).slice(0, 50);
  return `Jira comment by ${author}${createdAt ? ` (${createdAt})` : ""}`;
}

function formatContextComment(comment: SelectedProviderComment): string {
  return `${commentLabel(comment)}:\n${sanitisePlainText(comment.plainText)}`;
}

function formatSnapshotComment(comment: SelectedProviderComment): string {
  return `[Jira comment ${comment.id}; mapping=${comment.mapping}]\n${formatContextComment(comment)}`;
}

function joinSections(sections: readonly string[]): string {
  return sections.filter(Boolean).join("\n\n");
}
