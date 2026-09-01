import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeContent, HomeKnowledgeCards } from "@/app/page";
import { ProjectPill } from "@/presentation/components/project-pill";
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

  it("shows Jira project titles as stable project-coloured pills", () => {
    render(
      <SearchResults
        results={[
          {
            id: "jira:SUP-42",
            kind: "external",
            title: "Investigate payroll queue",
            snippet: "Incident",
            url: "/providers/jira/issues/SUP-42",
            sourceLabel: "Jira",
            status: "open",
            score: 1,
            exactMatch: false,
            updatedAt: "2026-08-28T00:00:00.000Z",
            metadata: {
              projectKey: "SUP",
              projectName: "Payroll",
              projectColour: "#2563EB",
            },
          },
          {
            id: "jira:OPS-7",
            kind: "external",
            title: "Restore deployment",
            snippet: "Task",
            url: "/providers/jira/issues/OPS-7",
            sourceLabel: "Jira",
            status: "open",
            score: 0.5,
            exactMatch: false,
            updatedAt: "2026-08-27T00:00:00.000Z",
            metadata: { projectKey: "OPS", projectName: "Operations" },
          },
        ]}
      />,
    );

    const payroll = screen.getByText("Payroll");
    const operations = screen.getByText("Operations");
    expect(payroll).toHaveAttribute("data-project-key", "SUP");
    expect(payroll.className).toContain("rounded-full");
    expect(payroll.style.backgroundColor).toBe("rgb(233, 239, 253)");
    expect(payroll.style.borderColor).toBe("rgb(179, 200, 248)");
    expect(payroll.style.color).toBe("rgb(13, 35, 82)");
    expect(operations).toHaveAttribute("data-project-key", "OPS");
    expect(operations.className).toContain("rounded-full");
    expect(payroll.getAttribute("style")).not.toBe(
      operations.getAttribute("style"),
    );
  });

  it("keeps a Jira project's pill colour stable and falls back to its key", () => {
    const { rerender } = render(
      <ProjectPill projectKey="SUP" projectName="Support" />,
    );
    const originalStyle = screen.getByText("Support").getAttribute("style");

    rerender(<ProjectPill projectKey="sup" projectName=" " />);
    expect(screen.getByText("sup").getAttribute("style")).toBe(originalStyle);
  });

  it("uses an explicit safe colour and rejects arbitrary CSS values", () => {
    const { rerender } = render(
      <ProjectPill projectKey="SUP" projectName="Support" colour="#2563EB" />,
    );
    const explicitStyle = screen.getByText("Support").getAttribute("style");
    expect(screen.getByText("Support").style.backgroundColor).toBe(
      "rgb(233, 239, 253)",
    );

    rerender(
      <ProjectPill
        projectKey="SUP"
        projectName="Support"
        colour="red;display:none"
      />,
    );
    expect(screen.getByText("Support").getAttribute("style")).not.toBe(
      explicitStyle,
    );

    rerender(<ProjectPill projectKey="SUP" projectName="Support" />);
    expect(screen.getByText("Support").getAttribute("style")).not.toBe(
      explicitStyle,
    );
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
