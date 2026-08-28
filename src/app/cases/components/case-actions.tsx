"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SupportCase } from "@/domain/support/support-case";
export function CaseActions({ supportCase }: { supportCase: SupportCase }) {
  const router = useRouter();
  const [notes, setNotes] = useState(supportCase.resolutionNotes);
  const [error, setError] = useState("");
  async function mutate(path: string, body: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error?.message ?? "Action failed");
    if (result.data.article)
      router.push(`/knowledge/${result.data.article.id}`);
    else {
      router.refresh();
    }
  }
  if (supportCase.status !== "Open" && supportCase.articleId) return null;
  return (
    <section>
      <h2>{supportCase.status === "Open" ? "Resolve" : "Knowledge"}</h2>
      {supportCase.status === "Open" && (
        <label>
          Resolution notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      )}
      <div className="form-actions">
        {supportCase.status === "Open" && (
          <button
            className="button primary"
            onClick={() =>
              mutate(`/api/v1/cases/${supportCase.id}/resolve`, {
                resolutionNotes: notes,
                expectedVersion: supportCase.version,
              })
            }
          >
            Resolve case
          </button>
        )}
        {!supportCase.articleId && (
          <button
            className="button secondary"
            onClick={() =>
              mutate(`/api/v1/cases/${supportCase.id}/draft-article`, {})
            }
          >
            Create draft article
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
