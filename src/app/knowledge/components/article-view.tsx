import Link from "next/link";
import type {
  KnowledgeArticle,
  KnowledgeStep,
} from "@/domain/knowledge/article";
import type { ArticleFeedback } from "@/application/articles/article-usefulness-service";
import type { RelatedArticle } from "@/application/articles/related-article-service";
import { UsefulnessPanel } from "./usefulness-panel";
import { CodeViewer } from "./code-viewer";

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const labels: Record<KnowledgeStep["stepType"], string> = {
  instruction: "Instruction",
  check: "Check",
  decision: "Decision",
  sql: "SQL",
  powershell: "PowerShell",
  code: "Code",
  url: "URL",
  warning: "Warning",
  expected_result: "Expected result",
};

export function ArticleView({
  article,
  feedback = [],
  related = [],
}: {
  article: KnowledgeArticle;
  feedback?: ArticleFeedback[];
  related?: RelatedArticle[];
}) {
  return (
    <main className="page-shell">
      <nav className="top-nav">
        <Link href="/">DejaView</Link>
        <Link href="/knowledge/new">New article</Link>
      </nav>
      <article className="article-card">
        <header className="article-header">
          <div>
            <span className={`status status-${article.status.toLowerCase()}`}>
              {article.status}
            </span>
            <span className="stable-key">{article.stableKey}</span>
          </div>
          <h1>{article.title}</h1>
          {article.summary && <p className="lede">{article.summary}</p>}
          <Link
            className="button secondary"
            href={`/knowledge/${article.id}/edit`}
          >
            Edit article
          </Link>
        </header>
        <section>
          <h2>Problem</h2>
          <p className="preserve-lines">{article.problem}</p>
        </section>
        {article.symptoms && (
          <section>
            <h2>Symptoms or error</h2>
            <p className="preserve-lines">{article.symptoms}</p>
          </section>
        )}
        {article.resolutionSummary && (
          <section>
            <h2>Resolution</h2>
            <p className="preserve-lines">{article.resolutionSummary}</p>
          </section>
        )}
        <section>
          <h2>Steps</h2>
          <ol className="step-list">
            {article.steps.map((step) => (
              <li key={step.id} className={`view-step step-${step.stepType}`}>
                <div className="step-heading">
                  <span className="step-number">{step.position + 1}</span>
                  <span className="step-type">{labels[step.stepType]}</span>
                </div>
                {step.title && <h3>{step.title}</h3>}
                <p className="preserve-lines">{step.instruction}</p>
                {step.code && (
                  <CodeViewer code={step.code} label={labels[step.stepType]} />
                )}
                {step.notes && (
                  <aside className="notes">
                    <strong>Notes:</strong> {step.notes}
                  </aside>
                )}
              </li>
            ))}
          </ol>
        </section>
        {article.sources.length > 0 && (
          <section>
            <h2>Source</h2>
            <ul>
              {article.sources.map((source, index) => {
                const href = safeExternalUrl(source.externalUrl);
                return (
                  <li
                    key={`${source.kind}:${source.externalKey ?? source.capturedAt}:${index}`}
                  >
                    <strong>{source.label}</strong>
                    {source.providerLabel &&
                    source.providerLabel !== source.label
                      ? ` — ${source.providerLabel}`
                      : ""}
                    {source.externalKey && href ? (
                      <>
                        {" — "}
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {source.externalKey}
                        </a>
                      </>
                    ) : source.sourceTitle &&
                      source.sourceTitle !== source.label ? (
                      ` — ${source.sourceTitle}`
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {article.edges.length > 0 && (
          <section>
            <h2>Flow</h2>
            <ul>
              {article.edges.map((edge) => (
                <li key={edge.id}>
                  {edge.edgeType}: step{" "}
                  {article.steps.findIndex((s) => s.id === edge.fromStepId) + 1}{" "}
                  → step{" "}
                  {article.steps.findIndex((s) => s.id === edge.toStepId) + 1}
                  {edge.label ? ` — ${edge.label}` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}
        <footer className="metadata">
          <div>
            <h2>Applications</h2>
            <div className="chips">
              {article.applications.map((item) => (
                <span className="chip" key={item.key}>
                  {item.name}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h2>Tags</h2>
            <div className="chips">
              {article.tags.map((item) => (
                <span className="chip" key={item.slug}>
                  {item.name}
                </span>
              ))}
            </div>
          </div>
        </footer>
        <UsefulnessPanel
          articleId={article.id}
          useCount={article.useCount}
          lastUsedAt={article.lastUsedAt}
          history={feedback}
        />
        <section>
          <h2>Related articles</h2>
          {related.length ? (
            <ul>
              {related.map((item) => (
                <li key={item.article.id}>
                  <Link href={`/knowledge/${item.article.id}`}>
                    {item.article.title}
                  </Link>{" "}
                  — {item.reasons.join("; ")}
                </li>
              ))}
            </ul>
          ) : (
            <p>No related published articles found.</p>
          )}
        </section>
      </article>
    </main>
  );
}
