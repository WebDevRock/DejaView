import {
  KnowledgeArticleError,
  createQuickDraft,
  prepareArticleUpdate,
  publishArticle,
  type ArticleUpdateInput,
  type KnowledgeArticle,
  type QuickDraftInput,
} from "../../domain/knowledge/article";
import type { ActorIdentity } from "../../domain/identity/actor";

export interface KnowledgeArticleRepository {
  create(article: KnowledgeArticle): KnowledgeArticle;
  list(): KnowledgeArticle[];
  get(id: string): KnowledgeArticle | null;
  update(
    article: KnowledgeArticle,
    expectedVersion: number,
  ): KnowledgeArticle | null;
}

export interface RuntimeValues {
  now(): string;
  id(): string;
}

export class KnowledgeService {
  constructor(
    private readonly repository: KnowledgeArticleRepository,
    private readonly runtime: RuntimeValues = {
      now: () => new Date().toISOString(),
      id: () => crypto.randomUUID(),
    },
  ) {}

  quickCreate(input: QuickDraftInput, actor: ActorIdentity): KnowledgeArticle {
    return this.repository.create(createQuickDraft(input, this.context(actor)));
  }

  list(): KnowledgeArticle[] {
    return this.repository.list();
  }

  get(id: string): KnowledgeArticle {
    const article = this.repository.get(id);
    if (!article)
      throw new KnowledgeArticleError("not_found", "Article not found");
    return article;
  }

  update(
    id: string,
    input: ArticleUpdateInput,
    actor: ActorIdentity,
  ): KnowledgeArticle {
    const current = this.get(id);
    const updated = prepareArticleUpdate(current, input, this.context(actor));
    const saved = this.repository.update(updated, input.version);
    if (!saved)
      throw new KnowledgeArticleError(
        "version_conflict",
        "Article version is stale",
      );
    return saved;
  }

  publish(id: string, version: number, actor: ActorIdentity): KnowledgeArticle {
    const current = this.get(id);
    const published = publishArticle(current, version, this.context(actor));
    const saved = this.repository.update(published, version);
    if (!saved)
      throw new KnowledgeArticleError(
        "version_conflict",
        "Article version is stale",
      );
    return saved;
  }

  private context(actor: ActorIdentity) {
    return { actorId: actor.id, now: this.runtime.now(), id: this.runtime.id };
  }
}
