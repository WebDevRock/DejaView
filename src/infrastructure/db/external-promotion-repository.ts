import "server-only";
import type {
  ExternalPromotionRepository,
  ExternalPromotionResult,
} from "../../application/sources/promote-external-item";
import type { KnowledgeService } from "../../application/articles/knowledge-service";
import type { ActorIdentity } from "../../domain/identity/actor";
import type {
  ProviderItem,
  ProviderProvenance,
} from "../../domain/sources/provider";
import type { DatabaseConnection } from "./client";
import { externalSourceLabel } from "./external-source-label";

export class SqliteExternalPromotionRepository implements ExternalPromotionRepository {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly knowledge: KnowledgeService,
  ) {}
  promote(
    item: ProviderItem,
    actor: ActorIdentity,
    provenance: ProviderProvenance,
  ): ExternalPromotionResult {
    return this.connection.sqlite.transaction(() => {
      const existing = this.connection.sqlite
        .prepare(
          `SELECT article_id AS articleId FROM knowledge_source_links WHERE source_kind = 'external' AND external_source_id = ? AND external_item_key = ?`,
        )
        .get(item.sourceId, item.externalKey) as
        { articleId: string } | undefined;
      if (existing) return { articleId: existing.articleId, duplicate: true };
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
      const problem = [item.title, item.plainText]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 20_000);
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
          steps: created.steps,
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
          item.plainText.slice(0, 20_000),
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
