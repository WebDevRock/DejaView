import type { ActorIdentity } from "../../domain/identity/actor";
import {
  SupportCaseError,
  createSupportCase,
  resolveSupportCase,
  updateSupportCase,
  type CreateCaseInput,
  type SupportCase,
  type UpdateCaseInput,
} from "../../domain/support/support-case";
import type { KnowledgeArticle } from "../../domain/knowledge/article";

export interface SupportCaseRepository {
  transaction<T>(operation: () => T): T;
  create(value: SupportCase): SupportCase;
  list(): SupportCase[];
  get(id: string): SupportCase | null;
  articleExists(id: string): boolean;
  update(value: SupportCase, expectedVersion: number): SupportCase | null;
}
export interface DraftArticleCreator {
  quickCreate(
    input: { problem: string; symptomsOrError?: string; whatFixedIt: string },
    actor: ActorIdentity,
  ): KnowledgeArticle;
}
export interface CaseRuntime {
  now(): string;
  id(): string;
}

export class SupportCaseService {
  constructor(
    private readonly repository: SupportCaseRepository,
    private readonly runtime: CaseRuntime = {
      now: () => new Date().toISOString(),
      id: () => crypto.randomUUID(),
    },
    private readonly articles?: DraftArticleCreator,
  ) {}
  create(input: CreateCaseInput, actor: ActorIdentity) {
    this.validateArticleMapping(input.articleId);
    return this.repository.create(
      createSupportCase(input, this.context(actor)),
    );
  }
  list() {
    return this.repository.list();
  }
  get(id: string) {
    const value = this.repository.get(id);
    if (!value)
      throw new SupportCaseError("not_found", "Support case not found");
    return value;
  }
  update(id: string, input: UpdateCaseInput, actor: ActorIdentity) {
    this.validateArticleMapping(input.articleId);
    const value = updateSupportCase(this.get(id), input, this.context(actor));
    const saved = this.repository.update(value, input.expectedVersion);
    if (!saved)
      throw new SupportCaseError("version_conflict", "Support case is stale");
    return saved;
  }
  resolve(
    id: string,
    input: { resolutionNotes: string; expectedVersion: number },
    actor: ActorIdentity,
  ) {
    const value = resolveSupportCase(
      this.get(id),
      input.resolutionNotes,
      this.context(actor),
    );
    const saved = this.repository.update(value, input.expectedVersion);
    if (!saved)
      throw new SupportCaseError("version_conflict", "Support case is stale");
    return saved;
  }
  createDraftArticle(
    id: string,
    input: { title?: string },
    actor: ActorIdentity,
  ) {
    if (!this.articles) throw new Error("Article creator is not configured");
    return this.repository.transaction(() => {
      const supportCase = this.get(id);
      const article = this.articles!.quickCreate(
        {
          problem: input.title?.trim() || supportCase.title,
          symptomsOrError: supportCase.description,
          whatFixedIt:
            supportCase.resolutionNotes ||
            supportCase.whatWasTried ||
            "Resolution to be documented",
        },
        actor,
      );
      const mapped = this.repository.update(
        {
          ...supportCase,
          articleId: article.id,
          version: supportCase.version + 1,
          updatedAt: this.runtime.now(),
        },
        supportCase.version,
      );
      if (!mapped)
        throw new SupportCaseError("version_conflict", "Support case is stale");
      return { supportCase: mapped, article };
    });
  }
  private context(actor: ActorIdentity) {
    return { actorId: actor.id, now: this.runtime.now(), id: this.runtime.id };
  }
  private validateArticleMapping(articleId?: string | null) {
    if (articleId && !this.repository.articleExists(articleId))
      throw new SupportCaseError("not_found", "Article not found");
  }
}
