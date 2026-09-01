import Link from "next/link";
import { notFound } from "next/navigation";
import { knowledgeSourceProviders } from "@/composition/root";
import { SafeContent } from "@/presentation/components/safe-content";
import { JiraActions } from "@/presentation/components/jira-actions";
import { ProjectPill } from "@/presentation/components/project-pill";
export const dynamic = "force-dynamic";
export default async function JiraIssuePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const provider = knowledgeSourceProviders().get("jira");
  if (!provider) notFound();
  const issue = await provider.getItem(key);
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <Link href="/search" className="font-semibold text-emerald-700">
        Back to search
      </Link>
      <div className="mt-6 flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wide text-emerald-700">
        <span>{issue.sourceLabel}</span>
        {typeof issue.metadata.projectKey === "string" && (
          <ProjectPill
            projectKey={issue.metadata.projectKey}
            projectName={
              typeof issue.metadata.projectName === "string"
                ? issue.metadata.projectName
                : null
            }
          />
        )}
        <span>{issue.externalKey}</span>
        <span>{issue.displayStatus ?? issue.status}</span>
      </div>
      <h1 className="mt-2 text-3xl font-semibold">{issue.title}</h1>
      <div className="mt-6 rounded-xl border bg-white p-6">
        <SafeContent nodes={issue.content} />
      </div>
      <p className="mt-4">
        <a
          href={issue.url}
          rel="noreferrer noopener"
          target="_blank"
          className="text-emerald-700 underline"
        >
          Open authoritative issue in Jira
        </a>
      </p>
      <JiraActions issueKey={issue.externalKey} />
    </main>
  );
}
