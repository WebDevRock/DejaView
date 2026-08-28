import { describe, expect, it } from "vitest";
import { compileFts5Query } from "@/application/search/fts-query";
import { SearchService } from "@/application/search/search-service";
import type { SearchPort } from "@/domain/search/search";
import type { KnowledgeSourceProvider } from "@/domain/sources/provider";

describe("FTS5 query compilation", () => {
  it("quotes terms and preserves an exact quoted error without accepting operators", () => {
    expect(compileFts5Query('printer AND "SQLSTATE 42P01" OR title:*')).toEqual(
      {
        expression: '"printer" OR "SQLSTATE 42P01" OR "title"',
        exactPhrases: ["SQLSTATE 42P01"],
        terms: ["printer", "title"],
      },
    );
  });
  it("turns malicious punctuation and FTS syntax into bounded harmless terms", () => {
    expect(compileFts5Query(`' )) NOT NEAR/1 {foo} * ^ : --`)).toMatchObject({
      expression: '"foo"',
    });
  });
  it("returns no expression for empty/operator-only input", () => {
    expect(compileFts5Query(" AND OR NOT  ")).toEqual({
      expression: null,
      exactPhrases: [],
      terms: [],
    });
  });
});

describe("SearchService", () => {
  it("normalises defaults and delegates through the framework-neutral port", async () => {
    let received: unknown;
    const port: SearchPort = {
      search: async (query) => {
        received = query;
        return { results: [], nextCursor: null };
      },
    };
    const result = await new SearchService(port).search({
      text: "  printer  ",
      application: "  Payroll  ",
      tag: "  Database  ",
    });
    expect(received).toMatchObject({
      text: "printer",
      application: "Payroll",
      tag: "Database",
      limit: 20,
    });
    expect(result).toEqual({
      results: [],
      nextCursor: null,
      partial: false,
      warnings: [],
    });
  });

  it("normalises UI date values to inclusive UTC day bounds", async () => {
    let received: unknown;
    const port: SearchPort = {
      search: async (query) => {
        received = query;
        return { results: [], nextCursor: null };
      },
    };
    await new SearchService(port).search({
      text: "printer",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-28",
    });
    expect(received).toMatchObject({
      dateFrom: "2026-08-01T00:00:00.000Z",
      dateTo: "2026-08-28T23:59:59.999Z",
    });
  });

  it("returns internal and external results deterministically with source labels", async () => {
    const internal: SearchPort = {
      search: async () => ({
        results: [
          {
            id: "article:1",
            kind: "article",
            title: "Internal",
            snippet: "",
            url: "/knowledge/1",
            sourceLabel: "Knowledge",
            status: "Published",
            score: 1,
            exactMatch: false,
            updatedAt: "2026-08-28T00:00:00Z",
            metadata: {},
          },
        ],
        nextCursor: null,
      }),
    };
    const provider = {
      id: "jira",
      label: "Support Jira",
      provenance: {
        providerType: "jira",
        secretEnvRef: "JIRA_API_TOKEN",
        promotionGuidance: "Review and document the resolution.",
      },
      capabilities: {
        search: true,
        itemDetail: true,
        comments: true,
        supportedFilters: ["project", "date"],
      },
      search: async () => [
        {
          id: "jira:SUP-1",
          externalKey: "SUP-1",
          title: "External",
          snippet: "",
          url: "/providers/jira/issues/SUP-1",
          sourceId: "jira",
          sourceLabel: "Support Jira",
          status: "open",
          displayStatus: "Awaiting triage",
          score: 1,
          updatedAt: "2026-08-28T00:00:00Z",
          metadata: {},
        },
      ],
      getItem: async () => {
        throw new Error();
      },
    } satisfies KnowledgeSourceProvider;
    const result = await new SearchService(internal, [provider]).search({
      text: "printer",
    });
    expect(result.results.map((item) => [item.id, item.sourceLabel])).toEqual([
      ["article:1", "Knowledge"],
      ["jira:SUP-1", "Support Jira"],
    ]);
    expect(result.results[1]).toMatchObject({
      status: "open",
      displayStatus: "Awaiting triage",
    });
    expect(result.partial).toBe(false);
  });

  it("preserves internal results and returns a sanitised warning when a provider fails", async () => {
    const internal: SearchPort = {
      search: async () => ({ results: [], nextCursor: null }),
    };
    const provider = {
      id: "jira",
      label: "Support Jira",
      provenance: {
        providerType: "jira",
        secretEnvRef: "JIRA_API_TOKEN",
        promotionGuidance: "Review and document the resolution.",
      },
      capabilities: {
        search: true,
        itemDetail: true,
        comments: false,
        supportedFilters: [],
      },
      search: async () => {
        throw new Error("secret token and upstream body");
      },
      getItem: async () => {
        throw new Error();
      },
    } satisfies KnowledgeSourceProvider;
    const result = await new SearchService(internal, [provider]).search({
      text: "printer",
    });
    expect(result).toMatchObject({
      partial: true,
      warnings: ["Support Jira is temporarily unavailable"],
    });
    expect(JSON.stringify(result)).not.toContain("secret token");
  });

  it("preserves public ISO datetime date filters", async () => {
    let received: unknown;
    const port: SearchPort = {
      search: async (query) => {
        received = query;
        return { results: [], nextCursor: null };
      },
    };
    await new SearchService(port).search({
      text: "printer",
      dateFrom: "2026-08-01T10:11:12.000Z",
      dateTo: "2026-08-28T20:21:22.000Z",
    });
    expect(received).toMatchObject({
      dateFrom: "2026-08-01T10:11:12.000Z",
      dateTo: "2026-08-28T20:21:22.000Z",
    });
  });
});
