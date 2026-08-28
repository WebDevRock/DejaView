import Link from "next/link";
import { notFound } from "next/navigation";
import { supportCaseService } from "@/composition/root";
import { SupportCaseError } from "@/domain/support/support-case";
import { CaseActions } from "../components/case-actions";
export const dynamic = "force-dynamic";
export default async function CasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let supportCase;
  try {
    supportCase = supportCaseService().get((await params).id);
  } catch (error) {
    if (error instanceof SupportCaseError && error.code === "not_found")
      notFound();
    throw error;
  }
  return (
    <main className="page-shell">
      <nav className="top-nav">
        <Link href="/cases">Support cases</Link>
        {supportCase.status === "Open" && (
          <Link href={`/cases/${supportCase.id}/edit`}>Edit case</Link>
        )}
      </nav>
      <article className="article-card">
        <span className={`status status-${supportCase.status.toLowerCase()}`}>
          {supportCase.status}
        </span>
        <span className="stable-key">{supportCase.stableKey}</span>
        <h1>{supportCase.title}</h1>
        <h2>Description</h2>
        <p className="preserve-lines">{supportCase.description}</p>
        <h2>What was tried</h2>
        <p className="preserve-lines">
          {supportCase.whatWasTried || "Nothing recorded"}
        </p>
        {supportCase.resolutionNotes && (
          <>
            <h2>Resolution</h2>
            <p className="preserve-lines">{supportCase.resolutionNotes}</p>
          </>
        )}
        {supportCase.articleId && (
          <p>
            <Link href={`/knowledge/${supportCase.articleId}`}>
              Open linked article
            </Link>
          </p>
        )}
        <CaseActions supportCase={supportCase} />
      </article>
    </main>
  );
}
