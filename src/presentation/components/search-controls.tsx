export type SearchControlValues = Readonly<{
  q?: string;
  source?: string;
  application?: string;
  tag?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
}>;

export function nextSearchHref(
  values: SearchControlValues,
  cursor: string,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value) params.set(key, value);
  params.set("cursor", cursor);
  return `/search?${params.toString()}`;
}

export function SearchControls({ values }: { values: SearchControlValues }) {
  return (
    <form
      role="search"
      className="mt-6 grid gap-3 rounded-xl bg-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <input
        type="search"
        name="q"
        defaultValue={values.q}
        aria-label="Search problems"
        className="rounded-lg border bg-white px-4 py-3 sm:col-span-2"
      />
      <select
        name="source"
        defaultValue={values.source ?? ""}
        aria-label="Source"
        className="rounded-lg border bg-white px-3"
      >
        <option value="">All sources</option>
        <option value="knowledge">Knowledge</option>
        <option value="support_case">Support cases</option>
        <option value="external">External sources</option>
      </select>
      <select
        name="status"
        defaultValue={values.status ?? ""}
        aria-label="Status"
        className="rounded-lg border bg-white px-3"
      >
        <option value="">All searchable statuses</option>
        <option value="published">Published</option>
        <option value="resolved">Resolved and closed</option>
      </select>
      <input
        name="application"
        defaultValue={values.application}
        aria-label="Application"
        placeholder="Application"
        className="rounded-lg border bg-white px-3 py-2"
      />
      <input
        name="tag"
        defaultValue={values.tag}
        aria-label="Tag"
        placeholder="Tag"
        className="rounded-lg border bg-white px-3 py-2"
      />
      <input
        type="date"
        name="dateFrom"
        defaultValue={values.dateFrom}
        aria-label="From date"
        className="rounded-lg border bg-white px-3 py-2"
      />
      <input
        type="date"
        name="dateTo"
        defaultValue={values.dateTo}
        aria-label="To date"
        className="rounded-lg border bg-white px-3 py-2"
      />
      <button className="rounded-lg bg-emerald-700 px-6 py-3 font-semibold text-white sm:col-span-2 lg:col-span-4">
        Search
      </button>
    </form>
  );
}
