// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  adfToPlainText,
  parseJiraAdf,
} from "@/infrastructure/providers/jira/adf";
import { buildJiraJql } from "@/infrastructure/providers/jira/jql";
import {
  jiraConfigurationFromEnvironment,
  parseJiraConfiguration,
} from "@/infrastructure/providers/jira/config";
import { JiraCloudProvider } from "@/infrastructure/providers/jira/provider";
import { ProviderError } from "@/domain/sources/provider";

const config = {
  sourceId: "jira" as const,
  sourceLabel: "Support Jira",
  baseUrl: "https://example.atlassian.net",
  email: "support@example.test",
  apiToken: "top-secret-token",
  projectKeys: ["SUP"],
  projectColours: { SUP: "#2563EB" },
  timeoutMs: 100,
};

describe("Jira JQL", () => {
  it("escapes ordinary text and limits projects without accepting raw JQL", () => {
    expect(buildJiraJql('printer" OR project = EVIL', ["SUP"])).toBe(
      'project IN ("SUP") AND text ~ "printer\\\" OR project = EVIL" ORDER BY updated DESC',
    );
  });
  it("rejects invalid project keys", () => {
    expect(() => buildJiraJql("printer", ["SUP) OR 1=1"])).toThrow();
  });
  it("adds inclusive UTC update boundaries without accepting date injection", () => {
    expect(
      buildJiraJql("printer", ["SUP"], {
        dateFrom: "2026-08-01T00:00:00.000Z",
        dateTo: "2026-08-28T23:59:59.999Z",
      }),
    ).toBe(
      'project IN ("SUP") AND text ~ "printer" AND updated >= "2026-08-01 00:00" AND updated <= "2026-08-28 23:59" ORDER BY updated DESC',
    );
    expect(() =>
      buildJiraJql("printer", ["SUP"], {
        dateFrom: '2026-08-01T00:00:00.000Z" OR project = EVIL',
      }),
    ).toThrow();
    expect(() =>
      buildJiraJql("printer", ["SUP"], {
        dateTo: "2026-02-30T23:59:59.999Z",
      }),
    ).toThrow();
  });
  it("normalises accepted ISO datetimes and offset boundaries to Jira UTC", () => {
    expect(
      buildJiraJql("printer", ["SUP"], {
        dateFrom: "2026-08-01T10:11:12Z",
        dateTo: "2026-08-01T23:59:59.999+01:00",
      }),
    ).toContain(
      'updated >= "2026-08-01 10:11" AND updated <= "2026-08-01 22:59"',
    );
    expect(
      buildJiraJql("printer", ["SUP"], {
        dateFrom: "2026-08-01T00:00:00-01:00",
        dateTo: "2026-08-01T23:59:59+01:00",
      }),
    ).toContain(
      'updated >= "2026-08-01 01:00" AND updated <= "2026-08-01 22:59"',
    );
    expect(
      buildJiraJql("printer", ["SUP"], {
        dateFrom: "2026-08-01T10:11:12.123456Z",
      }),
    ).toContain('updated >= "2026-08-01 10:11"');
    expect(
      buildJiraJql("printer", ["SUP"], {
        dateFrom: "2026-08-01T10:11Z",
      }),
    ).toContain('updated >= "2026-08-01 10:11"');
  });
});

describe("Jira ADF safety", () => {
  it("keeps allowlisted structure, drops unsafe links and degrades unknown nodes to text", () => {
    const ast = parseJiraAdf({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello <script>" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "click",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
        { type: "extension", content: [{ type: "text", text: "safe child" }] },
      ],
    });
    expect(JSON.stringify(ast)).not.toContain("javascript:");
    expect(adfToPlainText(ast)).toContain("Hello <script>");
    expect(adfToPlainText(ast)).toContain("safe child");
  });

  it("stops traversing untrusted arrays when the node budget is exhausted", () => {
    let indexedReads = 0;
    const content = new Proxy(
      Array.from({ length: 100_000 }, () => ({ type: "text", text: "x" })),
      {
        get(target, property, receiver) {
          if (typeof property === "string" && /^\d+$/.test(property))
            indexedReads++;
          return Reflect.get(target, property, receiver);
        },
      },
    );

    const nodes = parseJiraAdf({ type: "doc", content });
    expect(nodes).toHaveLength(2_000);
    expect(indexedReads).toBeLessThanOrEqual(2_001);
  });

  it("charges malformed child entries against the node budget", () => {
    let indexedReads = 0;
    const content = new Proxy(
      Array.from({ length: 100_000 }, () => null),
      {
        get(target, property, receiver) {
          if (typeof property === "string" && /^\d+$/.test(property))
            indexedReads++;
          return Reflect.get(target, property, receiver);
        },
      },
    );

    expect(parseJiraAdf({ type: "doc", content })).toEqual([]);
    expect(indexedReads).toBeLessThanOrEqual(2_001);
  });

  it("bounds untrusted text-mark traversal", () => {
    let indexedReads = 0;
    const marks = new Proxy(
      Array.from({ length: 100_000 }, () => ({ type: "strong" })),
      {
        get(target, property, receiver) {
          if (typeof property === "string" && /^\d+$/.test(property))
            indexedReads++;
          return Reflect.get(target, property, receiver);
        },
      },
    );

    parseJiraAdf({
      type: "doc",
      content: [{ type: "text", text: "safe", marks }],
    });
    expect(indexedReads).toBeLessThanOrEqual(50);
  });
});

describe("Jira configuration", () => {
  it("accepts only approved HTTPS Atlassian hosts without credentials or ports", () => {
    expect(parseJiraConfiguration(config).baseUrl).toBe(config.baseUrl);
    for (const baseUrl of [
      "http://example.atlassian.net",
      "https://user:pass@example.atlassian.net",
      "https://127.0.0.1",
      "https://example.atlassian.net:8443",
      "https://example.atlassian.net/rest/api/3",
      "https://example.atlassian.net/?redirect=https://evil.example",
      "https://example.atlassian.net.evil.example",
      "https://evil.example",
    ])
      expect(() => parseJiraConfiguration({ ...config, baseUrl })).toThrow();
  });
  it("uses the one canonical Jira source identity", () => {
    expect(() =>
      parseJiraConfiguration({ ...config, sourceId: "support-jira" }),
    ).toThrow();
  });

  it("parses optional project colours from the environment", () => {
    const environment = {
      NODE_ENV: "test",
      JIRA_BASE_URL: config.baseUrl,
      JIRA_EMAIL: config.email,
      JIRA_API_TOKEN: config.apiToken,
      JIRA_PROJECT_KEYS: "SUP,OPS",
      JIRA_PROJECT_COLOURS: "SUP:#2563EB,OPS:#059a6b",
    } as NodeJS.ProcessEnv;

    expect(
      jiraConfigurationFromEnvironment(environment)?.projectColours,
    ).toEqual({
      SUP: "#2563EB",
      OPS: "#059A6B",
    });
    expect(
      jiraConfigurationFromEnvironment({
        ...environment,
        JIRA_PROJECT_COLOURS: undefined,
      }),
    ).toMatchObject({ projectColours: {} });
  });

  it("allows at most 50 project colour entries", () => {
    const projectKeys = Array.from({ length: 50 }, (_, index) => `P${index}`);
    const environment = {
      NODE_ENV: "test",
      JIRA_BASE_URL: config.baseUrl,
      JIRA_EMAIL: config.email,
      JIRA_API_TOKEN: config.apiToken,
      JIRA_PROJECT_KEYS: projectKeys.join(","),
      JIRA_PROJECT_COLOURS: projectKeys
        .map((key) => `${key}:#2563EB`)
        .join(","),
    } as NodeJS.ProcessEnv;

    expect(
      Object.keys(
        jiraConfigurationFromEnvironment(environment)!.projectColours,
      ),
    ).toHaveLength(50);
    expect(() =>
      jiraConfigurationFromEnvironment({
        ...environment,
        JIRA_PROJECT_KEYS: `${environment.JIRA_PROJECT_KEYS},P50`,
        JIRA_PROJECT_COLOURS: `${environment.JIRA_PROJECT_COLOURS},P50:#2563EB`,
      }),
    ).toThrow();
  });

  it.each([
    ["lowercase key", "sup:#2563EB"],
    ["unknown key", "DEV:#2563EB"],
    ["duplicate key", "SUP:#2563EB,SUP:#059669"],
    ["short hex", "SUP:#123"],
    ["arbitrary CSS", "SUP:red"],
    ["trailing entry", "SUP:#2563EB,"],
  ])("rejects an invalid project colour %s", (_description, projectColours) => {
    expect(() =>
      jiraConfigurationFromEnvironment({
        NODE_ENV: "test",
        JIRA_BASE_URL: config.baseUrl,
        JIRA_EMAIL: config.email,
        JIRA_API_TOKEN: config.apiToken,
        JIRA_PROJECT_KEYS: "SUP,OPS",
        JIRA_PROJECT_COLOURS: projectColours,
      }),
    ).toThrow();
  });
});

describe("Jira Cloud provider", () => {
  it("rejects projects and issue keys outside the configured allow-list as invalid requests", async () => {
    const provider = new JiraCloudProvider(config, vi.fn());
    await expect(
      provider.search({ text: "printer", limit: 10, projects: ["EVIL"] }),
    ).rejects.toMatchObject({ code: "invalid_request", retryable: false });
    await expect(provider.getItem("EVIL-1")).rejects.toMatchObject({
      code: "invalid_request",
      retryable: false,
    });
  });

  it("uses lightweight search, then lazily fetches detail and comments", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            issues: [
              {
                key: "SUP-1",
                fields: {
                  summary: "Printer",
                  status: {
                    name: "<b>Awaiting triage</b>",
                    statusCategory: { key: "new" },
                  },
                  project: { key: "SUP", name: "Support" },
                  issuetype: { name: "Bug" },
                  updated: "2026-08-28T10:00:00.000Z",
                },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            key: "SUP-1",
            fields: {
              summary: "Printer",
              description: { type: "doc", content: [] },
              status: { name: "Open" },
              project: { key: "SUP", name: "Support" },
              issuetype: { name: "Bug" },
              updated: "2026-08-28T10:00:00.000Z",
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            comments: [],
            startAt: 0,
            maxResults: 50,
            total: 0,
          }),
          { status: 200 },
        ),
      );
    const provider = new JiraCloudProvider(config, fetcher);
    const results = await provider.search({ text: "printer", limit: 10 });
    expect(results[0]).toMatchObject({
      status: "open",
      displayStatus: "Awaiting triage",
      snippet: "Bug",
      metadata: {
        projectKey: "SUP",
        projectName: "Support",
        projectColour: "#2563EB",
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]![0])).toContain(
      "/rest/api/3/search/jql?",
    );
    expect(String(fetcher.mock.calls[0]![0])).not.toContain("comment");
    await provider.getItem("SUP-1");
    expect(fetcher).toHaveBeenCalledTimes(2);
    await provider.getComments("SUP-1");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("maps Jira status categories into the bounded external taxonomy", async () => {
    const categories = ["new", "indeterminate", "done", "undefined"];
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        issues: categories.map((key, index) => ({
          key: `SUP-${index + 1}`,
          fields: {
            summary: "Issue",
            status: { name: "Custom", statusCategory: { key } },
            project: { key: "SUP", name: "Support" },
            issuetype: { name: "Bug" },
            updated: "2026-08-28T10:00:00.000Z",
          },
        })),
      }),
    );
    const results = await new JiraCloudProvider(config, fetcher).search({
      text: "x",
      limit: 10,
    });
    expect(results.map((item) => item.status)).toEqual([
      "open",
      "in_progress",
      "resolved",
      "unknown",
    ]);
  });

  it("rejects malformed and oversized search and detail payloads safely", async () => {
    const malformed = new JiraCloudProvider(
      config,
      vi.fn().mockResolvedValue(Response.json({ issues: [{ fields: {} }] })),
    );
    await expect(
      malformed.search({ text: "x", limit: 10 }),
    ).rejects.toMatchObject({ code: "unsafe_response", retryable: false });

    const oversized = new JiraCloudProvider(
      config,
      vi.fn().mockResolvedValue(
        Response.json({
          issues: Array.from({ length: 11 }, (_, index) => ({
            key: `SUP-${index + 1}`,
            fields: {
              summary: "Issue",
              status: { name: "Open", statusCategory: { key: "new" } },
              project: { key: "SUP", name: "Support" },
              issuetype: { name: "Bug" },
              updated: "2026-08-28T10:00:00.000Z",
            },
          })),
        }),
      ),
    );
    await expect(
      oversized.search({ text: "x", limit: 10 }),
    ).rejects.toMatchObject({ code: "unsafe_response", retryable: false });

    const badDetail = new JiraCloudProvider(
      config,
      vi.fn().mockResolvedValue(Response.json({ key: "SUP-1", fields: null })),
    );
    await expect(badDetail.getItem("SUP-1")).rejects.toMatchObject({
      code: "unsafe_response",
      retryable: false,
    });
  });

  it("rejects an excessive content-length before parsing any Jira response", async () => {
    const response = new Response('{"issues":[]}', {
      headers: { "content-length": "1000001" },
    });
    const json = vi.spyOn(response, "json");
    const provider = new JiraCloudProvider(
      config,
      vi.fn().mockResolvedValue(response),
    );

    const error = await provider
      .search({ text: "secret-body-marker", limit: 10 })
      .catch((value) => value);

    expect(error).toMatchObject({ code: "unsafe_response", retryable: false });
    expect(json).not.toHaveBeenCalled();
    expect(JSON.stringify(error)).not.toContain("secret-body-marker");
  });

  it("cancels an oversized chunked Jira response before JSON parsing", async () => {
    const cancel = vi.fn();
    const chunk = new Uint8Array(600_000);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
      },
      cancel,
    });
    const provider = new JiraCloudProvider(
      config,
      vi.fn().mockResolvedValue(new Response(body)),
    );

    const error = await provider.getItem("SUP-1").catch((value) => value);

    expect(error).toMatchObject({ code: "unsafe_response", retryable: false });
    expect(cancel).toHaveBeenCalledOnce();
    expect(JSON.stringify(error)).not.toContain("Uint8Array");
  });

  it("validates comment pagination, clamps cursors and ignores upstream totals", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        comments: [
          {
            id: "1",
            author: { displayName: "Alex" },
            created: "2026-08-28T10:00:00.000Z",
            body: null,
          },
        ],
        startAt: 10_000,
        maxResults: 50,
        total: 999_999,
      }),
    );
    const provider = new JiraCloudProvider(config, fetcher);
    await expect(
      provider.getComments("SUP-1", "not-a-cursor"),
    ).rejects.toMatchObject({ code: "invalid_request" });
    const page = await provider.getComments("SUP-1", "999999999999999999999");
    expect(String(fetcher.mock.calls[0]![0])).toContain("startAt=10000");
    expect(page.nextCursor).toBeNull();

    const oversized = new JiraCloudProvider(
      config,
      vi.fn().mockResolvedValue(
        Response.json({
          comments: Array(51).fill({
            id: "1",
            author: { displayName: "A" },
            created: "2026-08-28T10:00:00.000Z",
            body: null,
          }),
          startAt: 0,
          maxResults: 50,
          total: 51,
        }),
      ),
    );
    await expect(oversized.getComments("SUP-1")).rejects.toMatchObject({
      code: "unsafe_response",
    });
  });

  it("retries one transient response and exposes no token or upstream body", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("token=top-secret-token", { status: 503 }),
      )
      .mockResolvedValueOnce(
        new Response("still token=top-secret-token", { status: 503 }),
      );
    const provider = new JiraCloudProvider(
      config,
      fetcher,
      async () => undefined,
    );
    const error = await provider
      .search({ text: "x", limit: 10 })
      .catch((value) => value);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(error).toBeInstanceOf(ProviderError);
    expect(JSON.stringify(error)).not.toContain("top-secret-token");
    expect(error.code).toBe("unavailable");
  });

  it("maps abort/timeouts and upstream statuses without leaking content", async () => {
    const aborting = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        ),
    );
    const provider = new JiraCloudProvider(
      { ...config, timeoutMs: 100 },
      aborting,
    );
    const controller = new AbortController();
    const pending = provider.search({
      text: "x",
      limit: 10,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      code: "timeout",
      retryable: true,
    });
    for (const [status, code] of [
      [400, "invalid_request"],
      [401, "unauthorised"],
      [403, "forbidden"],
      [404, "not_found"],
      [429, "rate_limited"],
    ] as const) {
      const mapped = new JiraCloudProvider(
        config,
        vi.fn().mockResolvedValue(new Response("sensitive", { status })),
        async () => undefined,
      );
      await expect(
        mapped.search({ text: "x", limit: 10 }),
      ).rejects.toMatchObject({ code });
    }
  });

  it("rejects a cross-origin redirect", async () => {
    const provider = new JiraCloudProvider(
      config,
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.example/steal" },
        }),
      ),
    );
    await expect(
      provider.search({ text: "x", limit: 10 }),
    ).rejects.toMatchObject({ code: "unsafe_response" });
  });
});
