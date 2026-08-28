# External knowledge providers

DejaView federates internal FTS5 results with enabled server-side providers. Provider failures are isolated: successful internal results remain visible and clients receive only a sanitised warning. External systems remain authoritative; DejaView does not synchronise or edit them.

## Jira Cloud (Phase 1)

Set the optional `JIRA_*` values shown in `.env.example` in the deployment environment or secret manager. Do not put real credentials in `.env.example`, source control, the database, source configuration, browser bundles or logs.

Security constraints:

- `JIRA_BASE_URL` must be an origin-only `https://*.atlassian.net` URL with no credentials, custom port, path, query or fragment.
- `JIRA_PROJECT_KEYS` is an allow-list. DejaView generates and escapes JQL from ordinary search text; raw JQL is never accepted.
- Native `fetch` uses a bounded timeout, manual redirect handling and at most one retry for rate limiting or transient server failure.
- Search requests fetch only summary metadata. Description is fetched on opening an issue; comments are fetched separately only when requested and are excluded from promotion.
- Jira ADF is converted into an allow-listed internal AST and plain text. Unknown nodes degrade to safe child text, unsafe links are removed and no upstream HTML is rendered.

## Promotion

An editor or administrator can promote a Jira issue. The mutation requires a same-origin request and fetches the issue again before creating a **Draft** article. The snapshot stores generic source provenance (source, external key, URL, title, capture time and sanitised plain text). A unique source/key constraint makes repeated promotion duplicate-safe. Promotion does not establish synchronisation; later Jira edits do not alter the draft.

## API

- `GET /api/v1/providers/jira/search?q=...&project=SUP&limit=20`
- `GET /api/v1/providers/jira/issues/SUP-1`
- `GET /api/v1/providers/jira/issues/SUP-1?includeComments=true&cursor=0`
- `POST /api/v1/providers/jira/issues/SUP-1/promote`

Responses follow the v1 `{ data, meta }` envelope. Provider error messages are deliberately generic and never contain credentials or raw Jira response bodies.

## User flow and verification

Search from `/search` with **All sources** or **External sources**. Jira results carry the configured source label and open a lazy-loaded safe detail view. Description text is rendered from the allow-listed AST; comments load only on request and remain paginated. **Promote to draft** performs an authenticated, explicit same-origin POST, fetches the issue afresh, and opens the local draft editor. A repeated promotion opens the already-linked draft rather than creating another one.

The automated suite uses mocked Jira HTTP responses and deliberately does not require or claim a live Jira connection. A live smoke test requires deployment-supplied `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` and `JIRA_PROJECT_KEYS`; verify search, detail, optional comments and draft promotion against a non-production Jira project without placing credentials in files or logs.

## SQLite operations

Run only one DejaView application instance against a SQLite database file. Before upgrades, stop the application and copy the database plus any `-wal` and `-shm` files together, or use SQLite's online backup command while the application is running. Protect backups with the same filesystem permissions and encryption as the live database.

To restore, stop DejaView, retain the failed database for investigation, restore the matching database/WAL/SHM set to `DATABASE_URL`, then run `npm run db:migrate`, `npm run search:reindex` and the health/search smoke tests before reopening access. Never merge SQLite files or restore only a stale WAL file.
