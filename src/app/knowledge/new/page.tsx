import Link from "next/link";
import { QuickArticleForm } from "../components/quick-article-form";

export default function NewKnowledgeArticlePage() {
  return (
    <main className="page-shell">
      <nav className="top-nav">
        <Link href="/">DejaView</Link>
      </nav>
      <section className="article-card narrow">
        <p className="eyebrow">Quick capture</p>
        <h1>New knowledge article</h1>
        <p className="lede">
          Capture the useful fix now. You can structure and publish it on the
          next screen.
        </p>
        <QuickArticleForm />
      </section>
    </main>
  );
}
