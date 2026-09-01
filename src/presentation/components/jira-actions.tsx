"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ProviderCommentMapping,
  ProviderCommentPage,
} from "../../domain/sources/provider";
import { SafeContent } from "./safe-content";

export function JiraActions({ issueKey }: { issueKey: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [comments, setComments] = useState<ProviderCommentPage | null>(null);
  const [selected, setSelected] = useState<
    Record<string, ProviderCommentMapping>
  >({});
  const [loading, setLoading] = useState<"promote" | "comments" | null>(null);
  const selectedCount = Object.keys(selected).length;

  async function promote() {
    setLoading("promote");
    setMessage("Creating draft…");
    try {
      const response = await fetch(
        `/api/v1/providers/jira/issues/${encodeURIComponent(issueKey)}/promote`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            comments: Object.entries(selected).map(([id, mapping]) => ({
              id,
              mapping,
            })),
          }),
        },
      );
      const body = await safeJson(response);
      const articleId = articleIdFrom(body);
      if (response.ok && articleId) router.push(`/knowledge/${articleId}/edit`);
      else if (errorCodeFrom(body) === "promotion_conflict")
        setMessage(
          "This Jira issue already has a draft. Selected comments were not added; open the existing draft without selections instead.",
        );
      else setMessage("The Jira draft could not be created. Please try again.");
    } catch {
      setMessage("The Jira draft could not be created. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  async function loadComments(cursor?: string) {
    setLoading("comments");
    setMessage("");
    try {
      const response = await fetch(
        `/api/v1/providers/jira/issues/${encodeURIComponent(issueKey)}?includeComments=true${cursor ? `&cursor=${cursor}` : ""}`,
      );
      const body = await safeJson(response);
      const page = commentPageFrom(body);
      if (!response.ok || !page) throw new Error();
      setComments((current) =>
        cursor && current
          ? {
              comments: [...current.comments, ...page.comments],
              nextCursor: page.nextCursor,
            }
          : page,
      );
      if (!cursor) setSelected({});
    } catch {
      setMessage("Jira comments could not be loaded. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="mt-8">
      <div className="flex gap-3">
        <button
          className="rounded bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-60"
          onClick={promote}
          disabled={loading !== null}
        >
          {loading === "promote" ? "Importing…" : "Import to knowledge"}
        </button>
        <button
          className="rounded border px-4 py-2 disabled:opacity-60"
          onClick={() => loadComments()}
          disabled={loading !== null}
        >
          {loading === "comments" ? "Loading comments…" : "Load comments"}
        </button>
      </div>
      {message && (
        <p role="status" className="mt-3 text-sm text-slate-600">
          {message}
        </p>
      )}
      {comments && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold">Comments</h2>
          <p className="mt-1 text-sm text-slate-600">
            {selectedCount} of 20 comments selected
          </p>
          {comments.comments.map((comment) => (
            <article
              key={comment.id}
              className="mt-3 rounded border bg-white p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <label className="font-semibold">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={comment.id in selected}
                    disabled={!(comment.id in selected) && selectedCount >= 20}
                    onChange={(event) =>
                      setSelected((current) => {
                        if (event.target.checked)
                          return { ...current, [comment.id]: "context" };
                        const next = { ...current };
                        delete next[comment.id];
                        return next;
                      })
                    }
                  />
                  Import comment {comment.id} by {comment.author},{" "}
                  {comment.createdAt}
                </label>
                <label>
                  Mapping for comment {comment.id} by {comment.author},{" "}
                  {comment.createdAt}
                  <select
                    className="ml-2 rounded border px-2 py-1"
                    value={selected[comment.id] ?? "context"}
                    disabled={!(comment.id in selected)}
                    onChange={(event) =>
                      setSelected((current) => ({
                        ...current,
                        [comment.id]: event.target
                          .value as ProviderCommentMapping,
                      }))
                    }
                  >
                    <option value="context">Context</option>
                    <option value="step">Instruction step</option>
                  </select>
                </label>
              </div>
              <p className="text-sm font-semibold">{comment.author}</p>
              <SafeContent nodes={comment.content} />
            </article>
          ))}
          {comments.nextCursor && (
            <button
              className="mt-3 underline disabled:opacity-60"
              onClick={() => loadComments(comments.nextCursor!)}
              disabled={loading !== null}
            >
              {loading === "comments" ? "Loading comments…" : "Next comments"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function articleIdFrom(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("data" in value)) return null;
  const data = value.data;
  if (!data || typeof data !== "object" || !("articleId" in data)) return null;
  return typeof data.articleId === "string" ? data.articleId : null;
}

function errorCodeFrom(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("error" in value)) return null;
  const error = value.error;
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function commentPageFrom(value: unknown): ProviderCommentPage | null {
  if (!value || typeof value !== "object" || !("meta" in value)) return null;
  const meta = value.meta;
  if (!meta || typeof meta !== "object" || !("comments" in meta)) return null;
  return isCommentPage(meta.comments) ? meta.comments : null;
}

function isCommentPage(value: unknown): value is ProviderCommentPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<ProviderCommentPage>;
  return (
    Array.isArray(page.comments) &&
    page.comments.length <= 50 &&
    page.comments.every(isComment) &&
    (page.nextCursor === null ||
      (typeof page.nextCursor === "string" &&
        /^\d{1,5}$/.test(page.nextCursor)))
  );
}

function isComment(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const comment = value as Record<string, unknown>;
  return (
    boundedString(comment.id, 100, true) &&
    boundedString(comment.author, 200) &&
    boundedString(comment.createdAt, 50, true) &&
    boundedString(comment.plainText, 20_000) &&
    isSafeContent(comment.content)
  );
}

function boundedString(value: unknown, maximum: number, required = false) {
  return (
    typeof value === "string" &&
    value.length <= maximum &&
    (!required || value.length > 0)
  );
}

function isSafeContent(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 2_000) return false;
  const budget = { nodes: 2_000, text: 20_000 };
  for (const node of value) if (!isSafeNode(node, budget, 0)) return false;
  return true;
}

function isSafeNode(
  value: unknown,
  budget: { nodes: number; text: number },
  depth: number,
): boolean {
  if (!value || typeof value !== "object" || depth > 64 || budget.nodes-- <= 0)
    return false;
  const node = value as Record<string, unknown>;
  if (node.type === "text") {
    if (!boundedString(node.text, budget.text)) return false;
    budget.text -= (node.text as string).length;
    return node.href === undefined || isSafeHref(node.href);
  }
  if (node.type === "hardBreak") return true;
  if (node.type === "codeBlock") {
    if (!boundedString(node.text, budget.text)) return false;
    budget.text -= (node.text as string).length;
    return node.language === undefined || boundedString(node.language, 40);
  }
  if (
    !["paragraph", "listItem", "bulletList", "orderedList", "heading"].includes(
      String(node.type),
    ) ||
    !Array.isArray(node.children) ||
    node.children.length > budget.nodes
  )
    return false;
  if (
    node.type === "heading" &&
    (!Number.isInteger(node.level) ||
      Number(node.level) < 1 ||
      Number(node.level) > 6)
  )
    return false;
  for (const child of node.children)
    if (!isSafeNode(child, budget, depth + 1)) return false;
  return true;
}

function isSafeHref(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 2_000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
