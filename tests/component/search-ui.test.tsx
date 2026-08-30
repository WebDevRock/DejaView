import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeContent, HomeKnowledgeCards } from "@/app/page";
import { SearchResults } from "@/presentation/components/search-results";
import {
  SearchControls,
  nextSearchHref,
} from "@/presentation/components/search-controls";
describe("search interface", () => {
  it("makes problem search the primary home action", () => {
    render(<HomeContent articles={[]} />);
    expect(
      screen.getByRole("heading", {
        name: "What problem are you trying to solve?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveAttribute("name", "q");
  });
  it("shows knowledge results with clear source labels and plain snippets", () => {
    render(
      <SearchResults
        results={[
          {
            id: "article:a",
            kind: "article",
            title: "Fix printer",
            snippet: "Replace cable",
            url: "/knowledge/a",
            sourceLabel: "Knowledge",
            status: "Published",
            score: 1,
            exactMatch: true,
            updatedAt: "2026-08-28T00:00:00.000Z",
            metadata: {},
          },
        ]}
      />,
    );
    expect(screen.getByText("Knowledge")).toBeInTheDocument();

    expect(screen.getByText("Replace cable")).toBeInTheDocument();
  });

  it("offers every search filter and retains them in pagination", () => {
    const values = {
      q: "printer",
      source: "knowledge",
      application: "Payroll",
      tag: "database",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-28",
      status: "published",
    };
    render(<SearchControls values={values} />);
    for (const name of [
      "Source",
      "Application",
      "Tag",
      "From date",
      "To date",
      "Status",
    ])
      expect(screen.getByLabelText(name)).toBeInTheDocument();
    const href = nextSearchHref(values, "signed.cursor");
    const params = new URL(href, "http://localhost").searchParams;
    expect(Object.fromEntries(params)).toEqual({
      ...values,
      cursor: "signed.cursor",
    });
  });

  it("shows real published knowledge cards or a truthful empty state", () => {
    const { container, rerender } = render(
      <HomeKnowledgeCards
        articles={[
          {
            id: "article-id",
            title: "Repair payroll export",
            summary: "Restore the reporting view",
            useCount: 4,
            sources: [
              {
                kind: "external",
                providerType: "jira",
                label: "Jira",
                providerLabel: "Support Jira",
                externalKey: "SUP-42",
                externalUrl: "https://tenant.atlassian.net/browse/SUP-42",
                sourceTitle: "Repair payroll export",
                capturedAt: "2026-08-28T10:00:00.000Z",
              },
            ],
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("link", { name: /Repair payroll export/ }),
    ).toHaveAttribute("href", "/knowledge/article-id");
    expect(screen.getByText(/Jira\s*·\s*SUP-42/)).toBeInTheDocument();
    expect(screen.getByText(/Used 4 times/)).toBeInTheDocument();

    rerender(<HomeKnowledgeCards articles={[]} />);
    expect(
      within(container).getByText("No published knowledge is available yet."),
    ).toBeInTheDocument();
  });
});
