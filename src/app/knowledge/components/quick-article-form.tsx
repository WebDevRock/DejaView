"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function QuickArticleForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const values = (name: string) =>
      String(form.get(name) ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    try {
      const response = await fetch("/api/v1/articles/quick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          problem: form.get("problem"),
          symptomsOrError: form.get("symptomsOrError") || undefined,
          whatFixedIt: form.get("whatFixedIt"),
          applications: values("applications"),
          tags: values("tags"),
        }),
      });
      const json = await response.json();
      if (!response.ok)
        throw new Error(json.error?.message ?? "Could not create the article");
      router.push(`/knowledge/${json.data.id}/edit`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not create the article",
      );
      setBusy(false);
    }
  };
  return (
    <form className="quick-form" onSubmit={submit}>
      <label>
        What problem did you solve?
        <textarea name="problem" required autoFocus />
      </label>
      <label>
        What symptoms or error did you see?{" "}
        <span className="hint">optional</span>
        <textarea name="symptomsOrError" />
      </label>
      <label>
        What fixed it?
        <textarea name="whatFixedIt" required />
      </label>
      <label>
        Applications <span className="hint">comma separated, optional</span>
        <input name="applications" placeholder="Payroll, Reporting" />
      </label>
      <label>
        Tags <span className="hint">comma separated, optional</span>
        <input name="tags" placeholder="Database, Export" />
      </label>
      {message && <p role="alert">{message}</p>}
      <button className="button primary" disabled={busy}>
        {busy ? "Creating…" : "Create draft"}
      </button>
    </form>
  );
}
