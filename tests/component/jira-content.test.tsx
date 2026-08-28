import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeContent } from "@/presentation/components/safe-content";
import { parseJiraAdf } from "@/infrastructure/providers/jira/adf";
import { SearchResults } from "@/presentation/components/search-results";

describe("Jira safe content renderer", () => {
  it("renders the sanitised provider display status instead of the taxonomy", () => {
    render(
      <SearchResults
        results={[
          {
            id: "jira:SUP-1",
            kind: "external",
            title: "Printer",
            snippet: "",
            url: "/providers/jira/issues/SUP-1",
            sourceLabel: "Jira",
            status: "open",
            displayStatus: "Awaiting triage",
            score: 1,
            exactMatch: false,
            updatedAt: "2026-08-28T10:00:00Z",
            metadata: {},
          },
        ]}
      />,
    );
    expect(screen.getByText("Awaiting triage")).toBeInTheDocument();
    expect(screen.queryByText("open")).not.toBeInTheDocument();
  });

  it("renders hostile text as text and never creates executable HTML", () => {
    const { container } = render(
      <SafeContent
        nodes={parseJiraAdf({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "<script>alert(1)</script>",
                  marks: [
                    { type: "link", attrs: { href: "javascript:alert(1)" } },
                  ],
                },
              ],
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });

  it("bounds deeply nested and oversized untrusted ADF", () => {
    let nested: unknown = { type: "text", text: "deep content" };
    for (let index = 0; index < 1_000; index++)
      nested = { type: "extension", content: [nested] };
    const nodes = parseJiraAdf({
      type: "doc",
      content: [
        nested,
        {
          type: "paragraph",
          content: [{ type: "text", text: "x".repeat(30_000) }],
        },
      ],
    });
    const { container } = render(<SafeContent nodes={nodes} />);
    expect(container.textContent?.length).toBeLessThanOrEqual(20_000);
  });
});
