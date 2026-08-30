import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { KnowledgeArticleRepository } from "../../application/articles/knowledge-service";
import type { ArticleFeedback } from "../../application/articles/article-usefulness-service";
import type {
  ArticleStatus,
  KnowledgeArticle,
  KnowledgeSource,
  KnowledgeStep,
  NamedApplication,
  NamedTag,
  StepEdge,
} from "../../domain/knowledge/article";
import type { DatabaseConnection } from "./client";
import { externalSourceLabel } from "./external-source-label";
import {
  applications,
  articleApplications,
  articleFeedback,
  articleTags,
  externalSources,
  knowledgeArticles,
  knowledgeSourceLinks,
  knowledgeSteps,
  searchDocuments,
  stepEdges,
  tags,
} from "./schema";

const toDatabaseStatus = (status: ArticleStatus) =>
  status.toLocaleLowerCase("en-GB") as
    "draft" | "published" | "deprecated" | "archived";
const toDomainStatus = (
  status: "draft" | "published" | "deprecated" | "archived",
) => `${status[0]!.toUpperCase()}${status.slice(1)}` as ArticleStatus;

export class SqliteKnowledgeArticleRepository implements KnowledgeArticleRepository {
  constructor(private readonly connection: DatabaseConnection) {}

  create(article: KnowledgeArticle): KnowledgeArticle {
    this.connection.sqlite.transaction(() => {
      const inserted = this.connection.db
        .insert(knowledgeArticles)
        .values(this.articleValues(article))
        .returning({ id: knowledgeArticles.id })
        .get();
      if (!inserted) throw new Error("Article insert did not return an ID");
      this.replaceOwnedRecords(article);
      this.insertInitialSources(article);
      this.writeSearchDocument(article);
    })();
    return this.required(article.id);
  }

  list(): KnowledgeArticle[] {
    const rows = this.connection.db
      .select()
      .from(knowledgeArticles)
      .orderBy(desc(knowledgeArticles.updatedAt), asc(knowledgeArticles.id))
      .all();
    if (!rows.length) return [];
    const ids = rows.map(({ id }) => id);
    const allSteps = this.connection.db
      .select()
      .from(knowledgeSteps)
      .where(inArray(knowledgeSteps.articleId, ids))
      .orderBy(asc(knowledgeSteps.articleId), asc(knowledgeSteps.position))
      .all() as KnowledgeStep[];
    const allEdges = this.connection.db
      .select()
      .from(stepEdges)
      .where(inArray(stepEdges.articleId, ids))
      .orderBy(
        asc(stepEdges.articleId),
        asc(stepEdges.createdAt),
        asc(stepEdges.id),
      )
      .all() as StepEdge[];
    const allApplications = this.connection.db
      .select({
        articleId: articleApplications.articleId,
        key: applications.key,
        name: applications.name,
      })
      .from(articleApplications)
      .innerJoin(
        applications,
        eq(articleApplications.applicationId, applications.id),
      )
      .where(inArray(articleApplications.articleId, ids))
      .orderBy(asc(articleApplications.articleId), asc(applications.name))
      .all();
    const allTags = this.connection.db
      .select({
        articleId: articleTags.articleId,
        slug: tags.slug,
        name: tags.name,
      })
      .from(articleTags)
      .innerJoin(tags, eq(articleTags.tagId, tags.id))
      .where(inArray(articleTags.articleId, ids))
      .orderBy(asc(articleTags.articleId), asc(tags.name))
      .all();
    const allSources = this.sourcesFor(ids);

    return rows.map((row) => ({
      ...row,
      status: toDomainStatus(row.status),
      steps: allSteps.filter((step) => step.articleId === row.id),
      edges: allEdges.filter((edge) => edge.articleId === row.id),
      applications: allApplications
        .filter((application) => application.articleId === row.id)
        .map(({ key, name }) => ({ key, name })),
      tags: allTags
        .filter((tag) => tag.articleId === row.id)
        .map(({ slug, name }) => ({ slug, name })),
      sources: allSources
        .filter((source) => source.articleId === row.id)
        .map((source) => {
          const { articleId, ...withoutArticleId } = source;
          void articleId;
          return withoutArticleId;
        }),
    }));
  }

  get(id: string): KnowledgeArticle | null {
    const row = this.connection.db
      .select()
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.id, id))
      .get();
    if (!row) return null;
    const steps = this.connection.db
      .select()
      .from(knowledgeSteps)
      .where(eq(knowledgeSteps.articleId, id))
      .orderBy(asc(knowledgeSteps.position))
      .all() as KnowledgeStep[];
    const edges = this.connection.db
      .select()
      .from(stepEdges)
      .where(eq(stepEdges.articleId, id))
      .orderBy(asc(stepEdges.createdAt), asc(stepEdges.id))
      .all() as StepEdge[];
    const linkedApplications = this.connection.db
      .select({ key: applications.key, name: applications.name })
      .from(articleApplications)
      .innerJoin(
        applications,
        eq(articleApplications.applicationId, applications.id),
      )
      .where(eq(articleApplications.articleId, id))
      .orderBy(asc(applications.name))
      .all();
    const linkedTags = this.connection.db
      .select({ slug: tags.slug, name: tags.name })
      .from(articleTags)
      .innerJoin(tags, eq(articleTags.tagId, tags.id))
      .where(eq(articleTags.articleId, id))
      .orderBy(asc(tags.name))
      .all();
    return {
      ...row,
      status: toDomainStatus(row.status),
      steps,
      edges,
      applications: linkedApplications,
      tags: linkedTags,
      sources: this.sourcesFor([id]).map((source) => {
        const { articleId, ...withoutArticleId } = source;
        void articleId;
        return withoutArticleId;
      }),
    };
  }

  update(
    article: KnowledgeArticle,
    expectedVersion: number,
  ): KnowledgeArticle | null {
    const changed = this.connection.sqlite.transaction(() => {
      const result = this.connection.db
        .update(knowledgeArticles)
        .set(this.articleValues(article))
        .where(
          and(
            eq(knowledgeArticles.id, article.id),
            eq(knowledgeArticles.version, expectedVersion),
          ),
        )
        .returning({ id: knowledgeArticles.id })
        .get();
      if (!result) return false;
      this.replaceOwnedRecords(article);
      this.writeSearchDocument(article);
      return true;
    })();
    return changed ? this.required(article.id) : null;
  }

  recordFeedback(feedback: ArticleFeedback): KnowledgeArticle {
    this.connection.sqlite.transaction(() => {
      this.connection.db.insert(articleFeedback).values(feedback).run();
      if (feedback.outcome === "yes") {
        const current = this.connection.db
          .select({ useCount: knowledgeArticles.useCount })
          .from(knowledgeArticles)
          .where(eq(knowledgeArticles.id, feedback.articleId))
          .get();
        if (!current)
          throw new Error("Article not found while recording feedback");
        this.connection.db
          .update(knowledgeArticles)
          .set({
            useCount: current.useCount + 1,
            lastUsedAt: feedback.createdAt,
            updatedAt: feedback.createdAt,
          })
          .where(eq(knowledgeArticles.id, feedback.articleId))
          .run();
        this.connection.db
          .update(searchDocuments)
          .set({ updatedAt: feedback.createdAt })
          .where(
            and(
              eq(searchDocuments.entityType, "article"),
              eq(searchDocuments.entityId, feedback.articleId),
            ),
          )
          .run();
      }
    })();
    return this.required(feedback.articleId);
  }

  feedbackHistory(articleId: string): ArticleFeedback[] {
    return this.connection.db
      .select()
      .from(articleFeedback)
      .where(eq(articleFeedback.articleId, articleId))
      .orderBy(desc(articleFeedback.createdAt), desc(articleFeedback.id))
      .all();
  }

  private required(id: string): KnowledgeArticle {
    const article = this.get(id);
    if (!article)
      throw new Error(`Article ${id} was not found after persistence`);
    return article;
  }

  private articleValues(article: KnowledgeArticle) {
    return {
      id: article.id,
      stableKey: article.stableKey,
      title: article.title,
      summary: article.summary,
      problem: article.problem,
      symptoms: article.symptoms,
      resolutionSummary: article.resolutionSummary,
      status: toDatabaseStatus(article.status),
      version: article.version,
      useCount: article.useCount,
      lastUsedAt: article.lastUsedAt,
      createdByUserId: article.createdByUserId,
      updatedByUserId: article.updatedByUserId,
      publishedByUserId: article.publishedByUserId,
      publishedAt: article.publishedAt,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
    };
  }

  private replaceOwnedRecords(article: KnowledgeArticle): void {
    this.connection.db
      .delete(stepEdges)
      .where(eq(stepEdges.articleId, article.id))
      .run();
    this.connection.db
      .delete(knowledgeSteps)
      .where(eq(knowledgeSteps.articleId, article.id))
      .run();
    this.connection.db
      .delete(articleApplications)
      .where(eq(articleApplications.articleId, article.id))
      .run();
    this.connection.db
      .delete(articleTags)
      .where(eq(articleTags.articleId, article.id))
      .run();
    if (article.steps.length)
      this.connection.db.insert(knowledgeSteps).values(article.steps).run();
    if (article.edges.length)
      this.connection.db.insert(stepEdges).values(article.edges).run();
    for (const application of article.applications)
      this.linkApplication(article, application);
    for (const tag of article.tags) this.linkTag(article, tag);
  }

  private insertInitialSources(article: KnowledgeArticle): void {
    if (!article.sources.length) return;
    this.connection.db
      .insert(knowledgeSourceLinks)
      .values(
        article.sources.map((source) => ({
          id: crypto.randomUUID(),
          articleId: article.id,
          sourceKind: source.kind,
          externalSourceId: null,
          externalItemKey: source.externalKey,
          externalUrl: source.externalUrl,
          sourceTitle: source.sourceTitle,
          capturedAt: source.capturedAt,
          snapshotText: null,
          createdAt: source.capturedAt,
        })),
      )
      .run();
  }

  private sourcesFor(
    ids: string[],
  ): Array<KnowledgeSource & { articleId: string }> {
    return this.connection.db
      .select({
        articleId: knowledgeSourceLinks.articleId,
        kind: knowledgeSourceLinks.sourceKind,
        providerType: externalSources.providerType,
        providerLabel: externalSources.name,
        externalKey: knowledgeSourceLinks.externalItemKey,
        externalUrl: knowledgeSourceLinks.externalUrl,
        sourceTitle: knowledgeSourceLinks.sourceTitle,
        capturedAt: knowledgeSourceLinks.capturedAt,
      })
      .from(knowledgeSourceLinks)
      .leftJoin(
        externalSources,
        eq(knowledgeSourceLinks.externalSourceId, externalSources.id),
      )
      .where(inArray(knowledgeSourceLinks.articleId, ids))
      .orderBy(
        asc(knowledgeSourceLinks.createdAt),
        asc(knowledgeSourceLinks.id),
      )
      .all()
      .map((source) => ({
        ...source,
        providerType:
          source.kind === "internal" ? "dejaview" : source.providerType,
        label:
          source.kind === "internal"
            ? "Created in DejaView"
            : source.providerType && source.providerLabel
              ? externalSourceLabel(source.providerType, source.providerLabel)
              : (source.sourceTitle ?? "External source"),
      }));
  }

  private linkApplication(
    article: KnowledgeArticle,
    application: NamedApplication,
  ): void {
    let row = this.connection.db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.key, application.key))
      .get();
    if (!row) {
      const id = crypto.randomUUID();
      const returned = this.connection.db
        .insert(applications)
        .values({
          id,
          key: application.key,
          name: application.name,
          description: "",
          createdAt: article.updatedAt,
          updatedAt: article.updatedAt,
        })
        .returning({ id: applications.id })
        .get();
      if (!returned) throw new Error("Application insert did not return an ID");
      row = this.connection.db
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.id, returned.id))
        .get();
    }
    if (!row) throw new Error("Application was not found after insertion");
    this.connection.db
      .insert(articleApplications)
      .values({
        articleId: article.id,
        applicationId: row.id,
        createdAt: article.updatedAt,
      })
      .run();
  }

  private linkTag(article: KnowledgeArticle, tag: NamedTag): void {
    let row = this.connection.db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.slug, tag.slug))
      .get();
    if (!row) {
      const id = crypto.randomUUID();
      const returned = this.connection.db
        .insert(tags)
        .values({
          id,
          slug: tag.slug,
          name: tag.name,
          createdAt: article.updatedAt,
          updatedAt: article.updatedAt,
        })
        .returning({ id: tags.id })
        .get();
      if (!returned) throw new Error("Tag insert did not return an ID");
      row = this.connection.db
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.id, returned.id))
        .get();
    }
    if (!row) throw new Error("Tag was not found after insertion");
    this.connection.db
      .insert(articleTags)
      .values({
        articleId: article.id,
        tagId: row.id,
        createdAt: article.updatedAt,
      })
      .run();
  }

  private searchSourceLabel(articleId: string): string {
    const source = this.connection.sqlite
      .prepare(
        `SELECT l.source_kind kind, l.source_title sourceTitle,
                e.provider_type providerType, e.name providerLabel
         FROM knowledge_source_links l
         LEFT JOIN external_sources e ON e.id=l.external_source_id
         WHERE l.article_id=?
         ORDER BY CASE
                    WHEN e.id IS NOT NULL THEN 0
                    WHEN l.source_kind='internal' THEN 1
                    WHEN l.source_kind='external' THEN 2
                    WHEN l.source_kind='manual' THEN 3
                    ELSE 4
                  END,
                  l.created_at, l.id
         LIMIT 1`,
      )
      .get(articleId) as
      | {
          kind: string;
          sourceTitle: string | null;
          providerType: string | null;
          providerLabel: string | null;
        }
      | undefined;
    if (source?.providerType && source.providerLabel)
      return externalSourceLabel(source.providerType, source.providerLabel);
    if (source?.kind === "external") return "Legacy source";
    if (source?.kind === "manual") return source.sourceTitle ?? "Manual source";
    return "DejaView knowledge";
  }

  private writeSearchDocument(article: KnowledgeArticle): void {
    const sourceLabel = this.searchSourceLabel(article.id);
    const body = [
      article.summary,
      article.problem,
      article.symptoms,
      article.resolutionSummary,
      ...article.steps.flatMap((step) => [
        step.title ?? "",
        step.instruction,
        step.bodyPlainText,
        step.code ?? "",
        step.notes ?? "",
      ]),
      ...article.applications.flatMap((application) => [
        application.name,
        application.key,
      ]),
      ...article.tags.flatMap((tag) => [tag.name, tag.slug]),
    ]
      .filter(Boolean)
      .join("\n");
    const exactTerms = [
      article.symptoms,
      ...article.steps.map((step) => step.code ?? ""),
    ]
      .filter(Boolean)
      .join("\n");
    this.connection.db
      .insert(searchDocuments)
      .values({
        id: `article:${article.id}`,
        entityType: "article",
        entityId: article.id,
        sourceLabel,
        title: article.title,
        body,
        exactTerms,
        status: toDatabaseStatus(article.status),
        updatedAt: article.updatedAt,
      })
      .onConflictDoUpdate({
        target: [searchDocuments.entityType, searchDocuments.entityId],
        set: {
          title: article.title,
          body,
          exactTerms,
          status: toDatabaseStatus(article.status),
          updatedAt: article.updatedAt,
          sourceLabel,
        },
      })
      .run();
  }
}
