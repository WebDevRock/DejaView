import { signIn } from "@/auth";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-emerald-700">DejaView</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Sign in</h1>
        <p className="mt-3 text-slate-600">
          Use your organisation&apos;s Microsoft account. Access is controlled
          by your Active Directory group membership.
        </p>
        <form
          className="mt-7"
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id", { redirectTo: "/" });
          }}
        >
          <button className="w-full rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white">
            Continue with Microsoft
          </button>
        </form>
      </section>
    </main>
  );
}
