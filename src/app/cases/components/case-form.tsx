"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SupportCase } from "@/domain/support/support-case";
import type { KnowledgeArticle } from "@/domain/knowledge/article";
export function CaseForm({
  supportCase,
  articles = [],
}: {
  supportCase?: SupportCase;
  articles?: KnowledgeArticle[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const occurred = String(form.get("occurredAt"));
    const body = {
      title: form.get("title"),
      description: form.get("description"),
      occurredAt: new Date(occurred).toISOString(),
      whatWasTried: form.get("whatWasTried"),
      articleId: form.get("articleId") || null,
      ...(supportCase ? { expectedVersion: supportCase.version } : {}),
    };
    const response = await fetch(
      supportCase ? `/api/v1/cases/${supportCase.id}` : "/api/v1/cases",
      {
        method: supportCase ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(result.error?.message ?? "Unable to save case");
      return;
    }
    router.push(`/cases/${result.data.id}`);
    router.refresh();
  }
  const localDate = supportCase?.occurredAt
    ? supportCase.occurredAt.slice(0, 16)
    : "";
  return (
    <form className="quick-form" onSubmit={submit}>
      <label>
        Title
        <input name="title" required defaultValue={supportCase?.title} />
      </label>
      <label>
        Description
        <textarea
          name="description"
          required
          defaultValue={supportCase?.description}
        />
      </label>
      <label>
        When did it occur?
        <input
          aria-label="When did it occur?"
          name="occurredAt"
          type="datetime-local"
          required
          defaultValue={localDate}
        />
      </label>
      <label>
        What was tried
        <textarea
          name="whatWasTried"
          defaultValue={supportCase?.whatWasTried}
        />
      </label>
      <label>
        Knowledge article
        <select name="articleId" defaultValue={supportCase?.articleId ?? ""}>
          <option value="">Unlinked</option>
          {articles.map((article) => (
            <option value={article.id} key={article.id}>
              {article.title}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="button primary" disabled={saving}>
        {saving ? "Saving…" : "Save case"}
      </button>
    </form>
  );
}
