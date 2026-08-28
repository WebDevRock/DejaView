import { notFound } from "next/navigation";
import {
  articleUsefulnessService,
  knowledgeService,
  relatedArticleService,
} from "@/composition/root";
import { KnowledgeArticleError } from "@/domain/knowledge/article";
import { ArticleView } from "../components/article-view";

export const dynamic = "force-dynamic";
export default async function KnowledgeArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let article;
  try {
    article = knowledgeService().get((await params).id);
  } catch (error) {
    if (error instanceof KnowledgeArticleError && error.code === "not_found")
      notFound();
    throw error;
  }
  return (
    <ArticleView
      article={article}
      feedback={articleUsefulnessService().history(article.id)}
      related={relatedArticleService().forArticle(article.id)}
    />
  );
}
