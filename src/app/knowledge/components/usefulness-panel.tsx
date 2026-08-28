"use client";
import { useState } from "react";
import type { ArticleFeedback } from "@/application/articles/article-usefulness-service";
export function UsefulnessPanel({
  articleId,
  useCount: initialCount,
  lastUsedAt: initialLastUsedAt,
  history: initialHistory,
}: {
  articleId: string;
  useCount: number;
  lastUsedAt: string | null;
  history: ArticleFeedback[];
}) {
  const [count, setCount] = useState(initialCount);
  const [lastUsedAt, setLastUsedAt] = useState(initialLastUsedAt);
  const [history, setHistory] = useState(initialHistory);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  async function record(outcome: "yes" | "no") {
    const response = await fetch(`/api/v1/articles/${articleId}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        outcome,
        ...(outcome === "no" && note ? { differenceNote: note } : {}),
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error?.message ?? "Could not record feedback");
      return;
    }
    setCount(result.data.article.useCount);
    setLastUsedAt(result.data.article.lastUsedAt);
    setHistory((items) => [result.data.feedback, ...items]);
    setMessage("Feedback recorded");
    setNote("");
  }
  return (
    <section>
      <h2>Was this useful?</h2>
      <p>
        Used {count} {count === 1 ? "time" : "times"}
        {lastUsedAt
          ? ` · last used ${new Date(lastUsedAt).toLocaleString("en-GB")}`
          : ""}
      </p>
      <div className="form-actions">
        <button className="button primary" onClick={() => record("yes")}>
          Yes
        </button>
        <button className="button secondary" onClick={() => record("no")}>
          No
        </button>
      </div>
      <label>
        What was different? (optional)
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      {message && <p role="status">{message}</p>}
      <details>
        <summary>Feedback history ({history.length})</summary>
        <ul>
          {history.map((item) => (
            <li key={item.id}>
              {item.outcome === "yes" ? "Useful" : "Not useful"}
              {item.differenceNote ? ` — ${item.differenceNote}` : ""} ·{" "}
              {new Date(item.createdAt).toLocaleString("en-GB")}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
