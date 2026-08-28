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
  it("shows mixed results with clear source labels and plain snippets", () => {
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
          {
            id: "support-case:c",
            kind: "support_case",
            title: "Printer case",
            snippet: "Restarted",
            url: "/cases/c",
            sourceLabel: "Support case",
            status: "Resolved",
            score: 2,
            exactMatch: false,
            updatedAt: "2026-08-27T00:00:00.000Z",
            metadata: {},
          },
        ]}
      />,
    );
    expect(screen.getByText("Knowledge")).toBeInTheDocument();
    expect(screen.getByText("Support case")).toBeInTheDocument();
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
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("link", { name: /Repair payroll export/ }),
    ).toHaveAttribute("href", "/knowledge/article-id");
    expect(screen.getByText(/Used 4 times/)).toBeInTheDocument();

    rerender(<HomeKnowledgeCards articles={[]} />);
    expect(
      within(container).getByText("No published knowledge is available yet."),
    ).toBeInTheDocument();
  });
});
