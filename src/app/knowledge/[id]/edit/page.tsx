import Link from "next/link";
import { notFound } from "next/navigation";
import { knowledgeService } from "@/composition/root";
import { KnowledgeArticleError } from "@/domain/knowledge/article";
import { ArticleEditor } from "../../components/article-editor";

export const dynamic = "force-dynamic";
export default async function EditKnowledgeArticlePage({
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
    <main className="page-shell">
      <nav className="top-nav">
        <Link href="/">DejaView</Link>
        <Link href={`/knowledge/${article.id}`}>View article</Link>
      </nav>
      <section className="article-card">
        <p className="eyebrow">
          {article.stableKey} · {article.status}
        </p>
        <h1>Edit knowledge article</h1>
        <ArticleEditor article={article} />
      </section>
    </main>
  );
}
