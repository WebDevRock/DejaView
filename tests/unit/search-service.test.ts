import { describe, expect, it } from "vitest";
import { compileFts5Query } from "@/application/search/fts-query";
import { SearchService } from "@/application/search/search-service";
import type { SearchPort } from "@/domain/search/search";

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
