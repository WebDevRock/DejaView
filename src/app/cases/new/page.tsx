import Link from "next/link";
import { knowledgeService } from "@/composition/root";
import { CaseForm } from "../components/case-form";
export const dynamic = "force-dynamic";
export default function NewCasePage() {
  return (
    <main className="page-shell">
      <nav className="top-nav">
        <Link href="/cases">Support cases</Link>
        <Link href="/">DejaView</Link>
      </nav>
      <section className="article-card narrow">
        <h1>Record support case</h1>
        <CaseForm articles={knowledgeService().list()} />
      </section>
    </main>
  );
}
