export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-emerald-500"
          />
          Service healthy
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
          DejaView
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-8 text-slate-600">
          The local-first support knowledge capture and federated search
          foundation is ready.
        </p>
      </section>
    </main>
  );
}
