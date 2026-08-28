// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetComposition } from "@/composition/root";
import { GET } from "@/app/api/v1/search/route";
let directory = "";
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "dejaview-search-api-"));
  process.env.DATABASE_URL = path.join(directory, "api.sqlite");
  resetComposition();
});
afterEach(() => {
  resetComposition();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete process.env.DATABASE_URL;
  fs.rmSync(directory, { recursive: true, force: true });
});
describe("GET /api/v1/search", () => {
  it("returns the v1 data/meta shape for an empty result", async () => {
    const response = await GET(
      new Request("http://localhost/api/v1/search?q=printer"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [],
      meta: { nextCursor: null, partial: false, warnings: [] },
    });
  });
  it("integrates a configured Jira provider while preserving internal results on upstream failure", async () => {
    vi.stubEnv("JIRA_BASE_URL", "https://tenant.atlassian.net");
    vi.stubEnv("JIRA_EMAIL", "service@example.test");
    vi.stubEnv("JIRA_API_TOKEN", "test-only-token");
    vi.stubEnv("JIRA_PROJECT_KEYS", "SUP");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
    );
    resetComposition();
    await GET(new Request("http://localhost/api/v1/search?q=printer"));
    const database = new Database(process.env.DATABASE_URL!);
    database
      .prepare("INSERT INTO search_documents VALUES (?,?,?,?,?,?,?,?,?)")
      .run(
        "article:local",
        "article",
        "local",
        "Knowledge",
        "Local printer fix",
        "printer",
        "printer",
        "published",
        "2026-08-28T00:00:00.000Z",
      );
    database.close();
    const response = await GET(
      new Request("http://localhost/api/v1/search?q=printer"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [{ id: "article:local", sourceLabel: "Knowledge" }],
      meta: {
        partial: true,
        warnings: ["Jira is temporarily unavailable"],
      },
    });
  });
  it("returns the consistent validation envelope", async () => {
    const response = await GET(
      new Request("http://localhost/api/v1/search?q=x&limit=999"),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({
      code: "invalid_request",
      requestId: expect.any(String),
    });
  });
  it("accepts UI date values and rejects invalid calendar dates", async () => {
    const accepted = await GET(
      new Request(
        "http://localhost/api/v1/search?q=printer&dateFrom=2026-08-01&dateTo=2026-08-28",
      ),
    );
    expect(accepted.status).toBe(200);
    const database = new Database(process.env.DATABASE_URL!);
    const insert = database.prepare(
      "INSERT INTO search_documents VALUES (?,?,?,?,?,?,?,?,?)",
    );
    insert.run(
      "article:late",
      "article",
      "late",
      "Knowledge",
      "Late printer",
      "printer",
      "printer",
      "published",
      "2026-08-28T23:59:59.999Z",
    );
    insert.run(
      "article:next",
      "article",
      "next",
      "Knowledge",
      "Next printer",
      "printer",
      "printer",
      "published",
      "2026-08-29T00:00:00.000Z",
    );
    database.close();
    const filtered = await GET(
      new Request("http://localhost/api/v1/search?q=printer&dateTo=2026-08-28"),
    );
    expect(
      (await filtered.json()).data.map((item: { id: string }) => item.id),
    ).toEqual(["article:late"]);
    const rejected = await GET(
      new Request("http://localhost/api/v1/search?q=printer&dateTo=2026-02-30"),
    );
    expect(rejected.status).toBe(400);
  });
  it("passes an ISO UTC datetime without fractional seconds to Jira safely", async () => {
    vi.stubEnv("JIRA_BASE_URL", "https://tenant.atlassian.net");
    vi.stubEnv("JIRA_EMAIL", "service@example.test");
    vi.stubEnv("JIRA_API_TOKEN", "test-only-token");
    vi.stubEnv("JIRA_PROJECT_KEYS", "SUP");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ issues: [] }));
    vi.stubGlobal("fetch", fetcher);
    resetComposition();

    const response = await GET(
      new Request(
        "http://localhost/api/v1/search?q=printer&source=jira&dateFrom=2026-08-01T10%3A11%3A12Z",
      ),
    );

    expect(response.status).toBe(200);
    expect(
      new URL(String(fetcher.mock.calls[0]![0])).searchParams.get("jql"),
    ).toContain('updated >= "2026-08-01 10:11"');
  });
  it("returns 400 for malformed, tampered and cross-query cursors", async () => {
    await GET(new Request("http://localhost/api/v1/search?q=initialise"));
    const database = new Database(process.env.DATABASE_URL!);
    const insert = database.prepare(
      "INSERT INTO search_documents VALUES (?,?,?,?,?,?,?,?,?)",
    );
    for (const id of ["one", "two"])
      insert.run(
        `article:${id}`,
        "article",
        id,
        "Knowledge",
        `${id} needle`,
        "needle",
        "needle",
        "published",
        "2026-08-28T00:00:00.000Z",
      );
    database.close();
    const first = await GET(
      new Request("http://localhost/api/v1/search?q=needle&limit=1"),
    );
    const cursor = (await first.json()).meta.nextCursor as string;
    expect(cursor).toEqual(expect.any(String));
    const [payload, signature] = cursor.split(".") as [string, string];
    for (const candidate of [
      "malformed",
      `${cursor.slice(0, -1)}x`,
      `${payload}!.${signature}`,
      `${payload}.${signature}!`,
      `${payload}=.${signature}`,
      `${payload}.${signature}=`,
      `${payload.slice(0, -1)}x.${signature}`,
      `.${signature}`,
      `${payload}.`,
      `${payload}..${signature}`,
    ]) {
      const response = await GET(
        new Request(
          `http://localhost/api/v1/search?q=needle&limit=1&cursor=${encodeURIComponent(candidate)}`,
        ),
      );
      expect(response.status).toBe(400);
    }
    const crossQuery = await GET(
      new Request(
        `http://localhost/api/v1/search?q=different&limit=1&cursor=${encodeURIComponent(cursor)}`,
      ),
    );
    expect(crossQuery.status).toBe(400);
  });

  it("fails safely in production without a cursor secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEJAVIEW_CURSOR_SECRET", "");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await GET(
      new Request("http://localhost/api/v1/search?q=printer"),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "internal_error",
        message: "An unexpected error occurred",
        requestId: expect.any(String),
      },
    });
    expect(log).toHaveBeenCalled();
  });
});
