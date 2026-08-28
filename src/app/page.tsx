import Link from "next/link";
import { knowledgeService } from "@/composition/root";

type HomeArticle = {
  id: string;
  title: string;
  summary: string;
  useCount: number;
};

export function HomeKnowledgeCards({ articles }: { articles: HomeArticle[] }) {
  if (!articles.length)
    return (
      <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-slate-600">
        No published knowledge is available yet.
      </p>
    );
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <article
          key={article.id}
          className="rounded-xl border bg-white p-5 shadow-sm"
        >
          <Link
            href={`/knowledge/${article.id}`}
            className="font-semibold text-slate-950"
          >
            {article.title}
          </Link>
          <p className="mt-2 text-sm text-slate-600">
            {article.summary || "No summary provided."}
          </p>
          <p className="mt-4 text-xs font-medium text-emerald-700">
            Used {article.useCount} {article.useCount === 1 ? "time" : "times"}
          </p>
        </article>
      ))}
    </div>
  );
}

export function HomeContent({ articles }: { articles: HomeArticle[] }) {
  return (
    <main className="min-h-screen bg-slate-50">
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
          <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-500" />
          Service healthy
        </div>
        <h2 className="font-semibold text-emerald-700">DejaView</h2>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          What problem are you trying to solve?
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          Local-first support knowledge: search published articles and resolved
          cases by symptom, application or exact error.
        </p>
        <form
          action="/search"
          role="search"
          className="mx-auto mt-9 flex max-w-3xl gap-3"
        >
          <input
            autoFocus
            type="search"
            name="q"
            aria-label="Search problems"
            placeholder='Try an error such as "SQLSTATE 42P01"'
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-5 py-4 text-lg shadow-sm"
          />
          <button className="rounded-xl bg-emerald-700 px-7 py-4 font-semibold text-white">
            Search
          </button>
        </form>
      </section>
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">
              Recent and useful knowledge
            </h2>
            <p className="mt-1 text-slate-600">
              Proven fixes from your support team.
            </p>
          </div>
          <nav className="flex gap-4">
            <Link href="/cases">Support cases</Link>
            <Link href="/knowledge/new">Add knowledge</Link>
          </nav>
        </div>
        <HomeKnowledgeCards articles={articles} />
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
export default function HomePage() {
  const articles = knowledgeService()
    .list()
    .filter((article) => article.status === "Published")
    .sort(
      (left, right) =>
        right.useCount - left.useCount ||
        right.updatedAt.localeCompare(left.updatedAt),
    )
    .slice(0, 6)
    .map(({ id, title, summary, useCount }) => ({
      id,
      title,
      summary,
      useCount,
    }));
  return <HomeContent articles={articles} />;
}
