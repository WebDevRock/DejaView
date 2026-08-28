import type { ActorIdentity } from "../../domain/identity/actor";
import {
  KnowledgeArticleError,
  type KnowledgeArticle,
} from "../../domain/knowledge/article";
import type { RuntimeValues } from "./knowledge-service";

export interface ArticleFeedback {
  id: string;
  articleId: string;
  submittedByUserId: string;
  outcome: "yes" | "no";
  differenceNote: string | null;
  createdAt: string;
}
export interface ArticleUsefulnessRepository {
  get(id: string): KnowledgeArticle | null;
  recordFeedback(feedback: ArticleFeedback): KnowledgeArticle;
  feedbackHistory(articleId: string): ArticleFeedback[];
}
export class ArticleUsefulnessService {
  constructor(
    private readonly repository: ArticleUsefulnessRepository,
    private readonly runtime: RuntimeValues = {
      now: () => new Date().toISOString(),
      id: () => crypto.randomUUID(),
    },
  ) {}
  record(
    articleId: string,
    input: { outcome: "yes" | "no"; differenceNote?: string },
    actor: ActorIdentity,
  ) {
    if (!this.repository.get(articleId))
      throw new KnowledgeArticleError("not_found", "Article not found");
    const note = input.differenceNote?.trim() || null;
    if (input.outcome === "yes" && note)
      throw new KnowledgeArticleError(
        "invalid_article",
        "A difference note is only valid for No feedback",
      );
    return this.repository.recordFeedback({
      id: this.runtime.id(),
      articleId,
      submittedByUserId: actor.id,
      outcome: input.outcome,
      differenceNote: note,
      createdAt: this.runtime.now(),
    });
  }
  history(articleId: string) {
    if (!this.repository.get(articleId))
      throw new KnowledgeArticleError("not_found", "Article not found");
    return this.repository.feedbackHistory(articleId);
  }
}
