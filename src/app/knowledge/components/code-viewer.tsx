"use client";

import { useState } from "react";

export function CodeViewer({ code, label }: { code: string; label: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  const buttonLabel =
    copyState === "copied"
      ? `${label} code copied`
      : copyState === "failed"
        ? `Copy ${label} code failed`
        : `Copy ${label} code`;

  return (
    <div className="code-viewer">
      <button
        aria-label={buttonLabel}
        className="copy-code-button"
        onClick={copyCode}
        type="button"
      >
        {copyState === "copied"
          ? "Copied"
          : copyState === "failed"
            ? "Copy failed"
            : "Copy code"}
      </button>
      <span className="sr-only" role="status">
        {copyState === "copied"
          ? `${label} code copied`
          : copyState === "failed"
            ? `Could not copy ${label} code`
            : ""}
      </span>
      <pre aria-label={`${label} code`}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
