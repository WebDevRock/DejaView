import { signOut } from "@/auth";

export default function ForbiddenPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-emerald-700">DejaView</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">
          Access denied
        </h1>
        <p className="mt-3 text-slate-600">
          Your account is authenticated but is not a member of an authorised
          DejaView Active Directory group.
        </p>
        <form
          className="mt-7"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/auth/signin" });
          }}
        >
          <button className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-800">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
