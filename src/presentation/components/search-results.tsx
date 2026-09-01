import Link from "next/link";
import type { SearchResult } from "../../domain/search/search";
import { ProjectPill } from "./project-pill";

function jiraProject(result: SearchResult) {
  const projectKey = result.metadata.projectKey;
  const projectName = result.metadata.projectName;
  if (result.kind !== "external" || typeof projectKey !== "string") return null;
  return {
    projectKey,
    projectName: typeof projectName === "string" ? projectName : null,
  };
}

export function SearchResults({ results }: { results: SearchResult[] }) {
  if (!results.length)
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">
        No results found. Try a different error code or phrase.
      </p>
    );
  return (
    <div className="grid gap-4">
      {results.map((result) => {
        const project = jiraProject(result);
        return (
          <article
            key={result.id}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              <span>{result.sourceLabel}</span>
              {project && <ProjectPill {...project} />}
              <span className="text-slate-400">
                {result.displayStatus ?? result.status}
              </span>
              {result.exactMatch && (
                <span className="rounded bg-amber-100 px-2 py-1 text-amber-800">
                  Exact match
                </span>
              )}
            </div>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">
              <Link href={result.url}>{result.title}</Link>
            </h2>
            <p className="mt-2 whitespace-pre-line text-slate-600">
              {result.snippet}
            </p>
          </article>
        );
      })}
    </div>
  );
}
