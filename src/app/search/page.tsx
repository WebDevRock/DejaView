import Link from "next/link";
import { searchService } from "@/composition/root";
import { SearchResults } from "@/presentation/components/search-results";
import {
  nextSearchHref,
  SearchControls,
} from "@/presentation/components/search-controls";
export const dynamic = "force-dynamic";
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const value = (key: string) =>
    typeof p[key] === "string" ? (p[key] as string) : undefined;
  const q = value("q") ?? "";
  const values = {
    q,
    source: value("source"),
    application: value("application"),
    tag: value("tag"),
    dateFrom: value("dateFrom"),
    dateTo: value("dateTo"),
    status: value("status"),
  };
  const result = await searchService().search({
    text: q,
    source: value("source") as "knowledge" | "support_case" | undefined,
    application: value("application"),
    tag: value("tag"),
    dateFrom: value("dateFrom"),
    dateTo: value("dateTo"),
    status: value("status") as "published" | "resolved" | undefined,
    cursor: value("cursor"),
  });
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <Link href="/" className="font-semibold text-emerald-700">
        DejaView
      </Link>
      <h1 className="mt-5 text-3xl font-semibold">Search results</h1>
      <SearchControls values={values} />
      <p className="my-6 text-sm text-slate-600">
        {result.results.length} result{result.results.length === 1 ? "" : "s"}{" "}
        for “{q}”
      </p>
      {result.partial && (
        <div
          role="status"
          className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900"
        >
          Some knowledge sources could not be searched.{" "}
          {result.warnings.join(" ")}
        </div>
      )}
      <SearchResults results={result.results} />
      {result.nextCursor && (
        <Link
          className="mt-8 inline-block rounded-lg border px-5 py-3"
          href={nextSearchHref(values, result.nextCursor)}
        >
          Next page
        </Link>
      )}
    </main>
  );
}
