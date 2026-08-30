# External knowledge providers

DejaView federates internal FTS5 results with enabled server-side knowledge providers. Providers implement domain contracts and remain adapters: external systems stay authoritative, while search results use a common, sanitised shape. One provider failing does not suppress successful local or other-provider results.

## Canonical Jira source identity

The Phase 1 Jira Cloud adapter has one canonical identity:

| Property                                     | Value            |
| -------------------------------------------- | ---------------- |
| Provider registry/source ID                  | `jira`           |
| Persisted `external_sources.id` on promotion | `jira`           |
| Persisted provider type                      | `jira`           |
| Secret environment reference                 | `JIRA_API_TOKEN` |
| Default display label                        | `Jira`           |

`JIRA_SOURCE_LABEL` changes the live provider/result label, but it does not create a second Jira source or alter the canonical ID/type. Jira result IDs are `jira:<ISSUE-KEY>`. Promotion provenance uses the same source ID and the `(external_source_id, external_item_key)` pair prevents duplicate local drafts. Imported article provenance is visibly canonical **Jira** while also retaining the configured provider label, exact issue key and validated canonical backlink.

## Jira environment configuration

Jira is optional. If `JIRA_BASE_URL` is absent, no Jira provider is registered. If it is present, configuration is strict and all required values must be valid.

| Variable            | Requirement                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `JIRA_BASE_URL`     | Required to enable Jira. Origin-only `https://<tenant>.atlassian.net`; no credentials, custom port, path, query or fragment. |
| `JIRA_EMAIL`        | Required. Valid email for a least-privileged Jira service account.                                                           |
| `JIRA_API_TOKEN`    | Required. Non-empty server-side secret.                                                                                      |
| `JIRA_PROJECT_KEYS` | Required. Comma-separated allow-list of 1–50 uppercase Jira project keys matching `[A-Z][A-Z0-9_]{0,19}`.                    |
| `JIRA_SOURCE_LABEL` | Optional display label, 1–100 characters; defaults to `Jira`.                                                                |
| `JIRA_TIMEOUT_MS`   | Optional integer from 100 to 30,000 milliseconds; defaults to `5000`.                                                        |

Keep credentials in the process environment or a secret manager. Never put real values in `.env.example`, source control, database configuration, browser bundles, screenshots, URLs or logs.

## Allowed projects and JQL

`JIRA_PROJECT_KEYS` is the authoritative project allow-list:

- a search with no project filter searches all configured allowed projects;
- an explicit `project` filter must be in the allow-list;
- issue detail, comments and promotion validate that the issue key belongs to an allowed project;
- project keys and issue keys are validated before they enter a Jira URL or JQL expression.

DejaView builds JQL from typed ordinary search text, allowed projects and optional date filters. String literals are escaped centrally; field names and operators are fixed by the adapter. Raw user-supplied JQL is never accepted.

## Request and content security

- Jira requests run only on the server and use Basic authentication derived from `JIRA_EMAIL` and `JIRA_API_TOKEN`.
- The tenant must be an approved `*.atlassian.net` HTTPS origin. Redirects are handled manually and rejected rather than followed.
- Each request has a bounded timeout. Rate-limit and transient server failures receive at most one retry, with a bounded delay.
- JSON responses are limited to 1 MB and validated with strict size/shape limits before mapping.
- Search fetches only issue key, summary, status, project, issue type and updated time.
- Provider errors exposed to clients are generic and sanitised; credentials and raw Jira response bodies do not cross the adapter boundary.
- Jira Atlassian Document Format is converted to an allow-listed internal AST and plain text. Unknown nodes degrade to safe child text, unsafe links are removed and upstream HTML is never rendered.

## Detail and comments

The search result is deliberately lightweight. Opening a result lazily fetches the full description. Comments are a separate, explicit request:

- `includeComments=true` opts into comment retrieval;
- pages contain at most 50 comments and use a numeric cursor bounded by the adapter;
- comments are rendered through the same safe AST pipeline;
- comments are for reference in the detail view only and are **not** included in a promoted article or provenance snapshot.

## Promotion is a snapshot, not synchronisation

An editor or administrator can explicitly promote an allowed Jira issue from a same-origin browser request. Promotion:

1. refetches the issue detail from Jira rather than trusting the search result or browser payload;
2. creates a local **Draft** article with generic, provider-neutral provenance;
3. records source ID, external key, exact validated canonical issue URL, configured source label, title, capture time and sanitised description plain text (up to the application limit);
4. stores only the name `JIRA_API_TOKEN` as `secret_env_ref`, never the token value;
5. returns the existing linked draft on repeated promotion rather than creating a duplicate.

The user must review, complete and publish the draft separately. Promotion does not copy comments and establishes no subscription. There is no background, scheduled, webhook-driven or bidirectional synchronisation: later Jira edits do not alter local knowledge, and DejaView does not edit Jira.

## HTTP surface and user flow

- `GET /api/v1/providers/jira/search?q=...&project=SUP&limit=20`
- `GET /api/v1/providers/jira/issues/SUP-1`
- `GET /api/v1/providers/jira/issues/SUP-1?includeComments=true&cursor=0`
- `POST /api/v1/providers/jira/issues/SUP-1/promote`

Unified `GET /api/v1/search` also includes Jira unless filters exclude it; `source=external` or `source=jira` selects external/Jira results. Responses use the v1 `{ data, meta }` envelope. Search and detail are read operations. Promotion requires an authenticated editor/admin and explicit same-origin browser evidence.

In the UI, search from `/search` with **All sources** or **External sources**. Live Jira results use the configured display label. Opening one loads safe detail; comments load only on request. **Promote to draft** refetches and opens the local editor, while repeated promotion opens the already-linked draft. The imported article displays canonical **Jira**, the configured source label, issue key and exact safe backlink; its stored snapshot remains internal and is not exposed as provenance UI content.

## Mocked and live verification

The automated suite uses mocked Jira HTTP responses. It verifies configuration, canonical identity, allow-listed/escaped JQL, request bounds, status mapping, retries, sanitised errors, ADF conversion, lazy comments and duplicate-safe snapshot promotion. It requires no credentials and is **not** evidence of a live Jira connection.

A live smoke test requires deployment-supplied `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` and `JIRA_PROJECT_KEYS`. Use a non-production allowed project and least-privileged account. Verify search, detail, paginated comments, draft promotion, repeated-promotion de-duplication and partial failure after credentials are removed/invalidated. Do not place credentials or raw responses in test evidence or logs. No live verification can be claimed when credentials are absent.

## Provider extension contract

A new provider implements `KnowledgeSourceProvider` in `src/domain/sources/provider.ts` and is registered through `ProviderRegistry`. It must provide:

- stable, unique `id` and user-facing `label` values;
- `provenance` containing provider-neutral `providerType`, a secret **environment-variable name** in `secretEnvRef`, and human review guidance for promoted drafts;
- `capabilities` declaring search/detail, optional comments and supported `project`/`date` filters;
- `search(query)` returning bounded, provider-neutral results with stable external keys, safe URLs, source identity/label, canonical status, relevance, updated time and client-safe metadata;
- `getItem(key)` returning safe AST content and a plain-text projection;
- optional `getComments(key, cursor)` only when comment capability is declared.

Adapters must validate configuration and external payloads, bound time/size/result counts, honour abort signals, reject unsafe redirects/URLs, sanitise errors and keep secrets/raw payloads behind the boundary. They must not accept arbitrary query languages from users. Unsupported filters must be declared rather than silently ignored.

Promotion remains application-owned and provider-neutral: the provider supplies a freshly fetched item plus provenance metadata; the repository creates the draft, external source row and generic source link transactionally. New providers must preserve snapshot/no-sync semantics and must not add provider-specific columns to core provenance.

## SQLite operations

Run one writable DejaView instance per SQLite file. Before an offline upgrade backup, stop the application and copy the database with matching `-wal` and `-shm` files, or use SQLite's online backup facility while it is running. Protect backups like the live database.

To restore, stop DejaView, retain failed files for investigation, restore a consistent database/WAL/SHM set to `DATABASE_URL`, then run `npm run db:migrate`, `npm run search:reindex` and health/search smoke tests before reopening access. Never merge SQLite files or restore a stale WAL in isolation.
