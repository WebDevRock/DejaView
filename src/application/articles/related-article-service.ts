import {
  KnowledgeArticleError,
  type KnowledgeArticle,
} from "../../domain/knowledge/article";

export interface RelatedArticleRepository {
  get(id: string): KnowledgeArticle | null;
  list(): KnowledgeArticle[];
}
export interface RelatedArticle {
  article: KnowledgeArticle;
  reasons: string[];
  score: number;
}
const words = (article: KnowledgeArticle) =>
  new Set(
    `${article.title} ${article.summary} ${article.problem} ${article.symptoms} ${article.resolutionSummary}`
      .toLocaleLowerCase("en-GB")
      .match(/[a-z0-9]{3,}/g) ?? [],
  );
export class RelatedArticleService {
  constructor(private readonly repository: RelatedArticleRepository) {}
  forArticle(id: string, limit = 5): RelatedArticle[] {
    const source = this.repository.get(id);
    if (!source)
      throw new KnowledgeArticleError("not_found", "Article not found");
    const sourceApps = new Set(source.applications.map((item) => item.key));
    const sourceTags = new Set(source.tags.map((item) => item.slug));
    const sourceWords = words(source);
    return this.repository
      .list()
      .filter(
        (candidate) => candidate.id !== id && candidate.status === "Published",
      )
      .map((article) => {
        const applications = article.applications.filter((item) =>
          sourceApps.has(item.key),
        );
        const tags = article.tags.filter((item) => sourceTags.has(item.slug));
        const overlap = [...words(article)].filter((word) =>
          sourceWords.has(word),
        );
        const reasons = [
          ...applications.map((item) => `Shared application: ${item.name}`),
          ...tags.map((item) => `Shared tag: ${item.name}`),
        ];
        if (!reasons.length && overlap.length)
          reasons.push(`Similar text: ${overlap.slice(0, 3).join(", ")}`);
        return {
          article,
          reasons,
          score:
            applications.length * 10000 + tags.length * 100 + overlap.length,
        };
      })
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.article.title.localeCompare(b.article.title, "en-GB") ||
          a.article.id.localeCompare(b.article.id),
      )
      .slice(0, Math.max(0, Math.min(limit, 20)));
  }
}
