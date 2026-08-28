import Link from "next/link";
import { notFound } from "next/navigation";
import { knowledgeService, supportCaseService } from "@/composition/root";
import { SupportCaseError } from "@/domain/support/support-case";
import { CaseForm } from "../../components/case-form";
export const dynamic = "force-dynamic";
export default async function EditCasePage({
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
  if (supportCase.status !== "Open") notFound();
  return (
    <main className="page-shell">
      <nav className="top-nav">
        <Link href={`/cases/${supportCase.id}`}>Back to case</Link>
        <Link href="/">DejaView</Link>
      </nav>
      <section className="article-card narrow">
        <h1>Edit case</h1>
        <CaseForm
          supportCase={supportCase}
          articles={knowledgeService().list()}
        />
      </section>
    </main>
  );
}
