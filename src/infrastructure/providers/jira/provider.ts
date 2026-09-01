import "server-only";
import { z } from "zod";
import type {
  KnowledgeSourceProvider,
  ProviderCommentPage,
  ProviderItem,
  ProviderSearchQuery,
  ProviderSearchResult,
} from "../../../domain/sources/provider";
import { ProviderError } from "../../../domain/sources/provider";
import { adfToPlainText, parseJiraAdf } from "./adf";
import type { JiraConfiguration } from "./config";
import { assertIssueKey, buildJiraJql } from "./jql";

type Fetcher = typeof fetch;
const MAX_RESPONSE_BYTES = 1_000_000;
const boundedText = (maximum: number) => z.string().max(maximum);
const jiraFieldsSchema = z.object({
  summary: boundedText(500),
  description: z.unknown().optional(),
  status: z.object({
    name: boundedText(100),
    statusCategory: z.object({ key: boundedText(50) }).optional(),
  }),
  project: z.object({ key: boundedText(20), name: boundedText(200) }),
  issuetype: z.object({ name: boundedText(100) }),
  updated: boundedText(50).min(1),
});
const jiraIssueSchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]{0,19}-[1-9][0-9]*$/),
  fields: jiraFieldsSchema,
});
const searchPayloadSchema = z.object({
  issues: z.array(jiraIssueSchema).max(50),
});
const commentPayloadSchema = z.object({
  comments: z
    .array(
      z.object({
        id: boundedText(100).min(1),
        author: z.object({ displayName: boundedText(200) }).optional(),
        created: boundedText(50).min(1),
        body: z.unknown(),
      }),
    )
    .max(50),
  startAt: z.number().int().min(0).max(10_000),
  maxResults: z.number().int().min(0).max(50),
  total: z.number().int().min(0).max(1_000_000_000),
});
type JiraFields = z.infer<typeof jiraFieldsSchema>;
type JiraIssue = z.infer<typeof jiraIssueSchema>;
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class JiraCloudProvider implements KnowledgeSourceProvider {
  readonly id: string;
  readonly label: string;
  readonly provenance = {
    providerType: "jira",
    secretEnvRef: "JIRA_API_TOKEN",
    promotionGuidance:
      "Review this captured Jira issue and document the verified resolution.",
  } as const;
  readonly capabilities = {
    search: true,
    itemDetail: true,
    comments: true,
    supportedFilters: ["project", "date"] as const,
  } as const;
  constructor(
    private readonly config: JiraConfiguration,
    private readonly fetcher: Fetcher = fetch,
    private readonly pause: (ms: number) => Promise<void> = sleep,
  ) {
    this.id = config.sourceId;
    this.label = config.sourceLabel;
  }
  async search(query: ProviderSearchQuery): Promise<ProviderSearchResult[]> {
    if (
      query.projects?.length &&
      query.projects.some((key) => !this.config.projectKeys.includes(key))
    )
      throw new ProviderError("invalid_request", false);
    const projects = query.projects?.length
      ? query.projects
      : this.config.projectKeys;
    const params = new URLSearchParams({
      jql: buildJiraJql(query.text, projects, {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      }),
      maxResults: String(Math.min(50, Math.max(1, query.limit))),
      fields: "summary,status,project,issuetype,updated",
    });
    const payload = parsePayload(
      searchPayloadSchema,
      await this.request(`/rest/api/3/search/jql?${params}`, query.signal),
    );
    if (payload.issues.length > Math.min(50, Math.max(1, query.limit)))
      throw new ProviderError("unsafe_response", false);
    return payload.issues.map((issue, index) => this.mapIssue(issue, index));
  }
  async getItem(
    key: string,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderItem> {
    const safeKey = this.safeIssueKey(key);
    const payload = parsePayload(
      jiraIssueSchema,
      await this.request(
        `/rest/api/3/issue/${encodeURIComponent(safeKey)}?fields=summary,description,status,project,issuetype,updated`,
        options?.signal,
      ),
    );
    const result = this.mapIssue(payload, 0);
    const content = parseJiraAdf(payload.fields?.description);
    return { ...result, content, plainText: adfToPlainText(content) };
  }
  async getComments(
    key: string,
    cursor = "0",
    options?: { signal?: AbortSignal },
  ): Promise<ProviderCommentPage> {
    const safeKey = this.safeIssueKey(key);
    if (!/^\d+$/.test(cursor))
      throw new ProviderError("invalid_request", false);
    const startAt = Math.min(10_000, Number.parseInt(cursor, 10));
    const payload = parsePayload(
      commentPayloadSchema,
      await this.request(
        `/rest/api/3/issue/${encodeURIComponent(safeKey)}/comment?startAt=${startAt}&maxResults=50&orderBy=created`,
        options?.signal,
      ),
    );
    if (payload.startAt !== startAt)
      throw new ProviderError("unsafe_response", false);
    const comments = payload.comments.map((comment) => {
      const content = parseJiraAdf(comment.body);
      return {
        id: comment.id,
        author: comment.author?.displayName ?? "Unknown",
        createdAt: comment.created,
        content,
        plainText: adfToPlainText(content),
      };
    });
    const end = startAt + comments.length;
    return {
      comments,
      nextCursor: comments.length === 50 && end <= 10_000 ? String(end) : null,
    };
  }
  private mapIssue(issue: JiraIssue, index: number): ProviderSearchResult {
    const key = issue.key;
    const fields = issue.fields;
    return {
      id: `${this.id}:${key}`,
      externalKey: key,
      title: fields.summary,
      snippet: fields.issuetype?.name ?? "",
      url: `${this.config.baseUrl}/browse/${encodeURIComponent(key)}`,
      sourceId: this.id,
      sourceLabel: this.label,
      status: jiraStatus(fields.status),
      displayStatus: sanitiseStatus(fields.status?.name),
      score: 1 / (index + 1),
      updatedAt: fields.updated,
      metadata: {
        projectKey: fields.project?.key ?? null,
        projectName: fields.project?.name ?? null,
        issueType: fields.issuetype?.name ?? null,
      },
    };
  }
  private safeIssueKey(key: string): string {
    try {
      return assertIssueKey(key, this.config.projectKeys);
    } catch {
      throw new ProviderError("invalid_request", false);
    }
  }
  private async request(
    path: string,
    externalSignal?: AbortSignal,
  ): Promise<unknown> {
    const url = new URL(path, this.config.baseUrl);
    for (let attempt = 0; attempt < 2; attempt++) {
      const timeout = AbortSignal.timeout(this.config.timeoutMs);
      const signal = externalSignal
        ? AbortSignal.any([externalSignal, timeout])
        : timeout;
      let response: Response;
      try {
        response = await this.fetcher(url, {
          headers: {
            accept: "application/json",
            authorization: `Basic ${Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString("base64")}`,
          },
          signal,
          redirect: "manual",
        });
      } catch {
        if (signal.aborted) throw new ProviderError("timeout", true);
        throw new ProviderError("unavailable", true);
      }
      if (response.status >= 300 && response.status < 400)
        throw new ProviderError("unsafe_response", false);
      if (response.ok) {
        return readBoundedJson(response);
      }
      const code = statusCode(response.status);
      if (
        attempt === 0 &&
        (response.status === 429 || response.status >= 500)
      ) {
        const retryAfter = Math.min(
          1_000,
          Math.max(0, Number(response.headers.get("retry-after") ?? 0) * 1_000),
        );
        await this.pause(retryAfter);
        continue;
      }
      throw new ProviderError(
        code,
        response.status === 429 || response.status >= 500,
      );
    }
    throw new ProviderError("unavailable", true);
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes < 0 ||
      declaredBytes > MAX_RESPONSE_BYTES
    )
      throw new ProviderError("unsafe_response", false);
  }
  if (!response.body) throw new ProviderError("unsafe_response", false);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ProviderError("unsafe_response", false);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(bytesRead);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("unsafe_response", false);
  } finally {
    reader.releaseLock();
  }
}

function parsePayload<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ProviderError("unsafe_response", false);
  return result.data;
}

function sanitiseStatus(value: string | undefined): string | undefined {
  const clean = value
    ?.replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return clean || undefined;
}

function jiraStatus(
  status: JiraFields["status"],
): ProviderSearchResult["status"] {
  const category = status?.statusCategory?.key?.toLowerCase();
  if (category === "new") return "open";
  if (category === "indeterminate") return "in_progress";
  if (category === "done")
    return /closed/i.test(status?.name ?? "") ? "closed" : "resolved";
  return "unknown";
}

function statusCode(status: number): ProviderError["code"] {
  if (status === 400) return "invalid_request";
  if (status === 401) return "unauthorised";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return status >= 500 ? "unavailable" : "unsafe_response";
}
