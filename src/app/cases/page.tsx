import Link from "next/link";
import { supportCaseService } from "@/composition/root";
export const dynamic = "force-dynamic";
export default function CasesPage() {
  const cases = supportCaseService().list();
  return (
    <main className="page-shell">
      <nav className="top-nav">
        <Link href="/">DejaView</Link>
        <Link href="/cases/new">Record case</Link>
      </nav>
      <section className="article-card">
        <h1>Support cases</h1>
        {cases.length ? (
          <ul className="step-list">
            {cases.map((item) => (
              <li className="view-step" key={item.id}>
                <span className={`status status-${item.status.toLowerCase()}`}>
                  {item.status}
                </span>
                <Link href={`/cases/${item.id}`}>{item.title}</Link>
                <p>{new Date(item.occurredAt).toLocaleString("en-GB")}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No cases recorded yet.</p>
        )}
      </section>
    </main>
  );
}
