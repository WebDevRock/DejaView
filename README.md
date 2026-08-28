# DejaView

DejaView is a local-first support knowledge capture and federated search application. It starts with the problem a support worker is trying to solve — a symptom, application name, exact error or quoted phrase — rather than asking them to browse a knowledge hierarchy. It brings reusable fixes, resolved support cases and optional Jira Cloud results into one clearly labelled result set, then lets an editor turn proven work into reviewed knowledge.

## MVP features

- Problem-first search across published knowledge articles, resolved support cases and an optional Jira Cloud provider.
- SQLite FTS5 search with exact-term handling, filters, deterministic ranking, pagination and partial-provider-failure warnings.
- Quick article capture, structured step editing, draft publication, applications, tags and related knowledge.
- Support-case capture, editing, resolution and draft-article creation with provenance.
- Useful/not-useful article feedback, optional difference notes and usage counts.
- Lazy Jira issue detail and paginated comments, with safe Atlassian Document Format rendering.
- Explicit, duplicate-safe promotion of a fresh Jira issue snapshot into a local **Draft** article.
- Versioned JSON API, input validation, optimistic concurrency and same-origin mutation checks.
- Deterministic, idempotent demonstration data for a published article and linked resolved case. Search for `E42` after seeding.

## Architecture

DejaView is a modular monolith: one Next.js 16 application, one Node.js process and one SQLite database. The App Router UI and `/api/v1` route handlers call application services; domain contracts sit inside infrastructure adapters for Drizzle/SQLite, FTS5 and external providers. Dependencies point inwards:

```text
app and infrastructure -> application -> domain
```

The server uses the Node.js runtime because `better-sqlite3` is native and process-local. Provider searches run alongside internal search and fail independently, so an unavailable Jira connection does not hide successful local results.

See [`docs/architecture.md`](docs/architecture.md) for the baseline decisions and schema, and [`docs/providers.md`](docs/providers.md) for the implemented provider contract and Jira details.

## Prerequisites

- Node.js 22.x (the supported engine is `>=22 <23`)
- npm 11 or later
- A writable directory for the SQLite database and its WAL/SHM files
- Optional: Jira Cloud credentials for live provider verification

## Local setup

```sh
npm ci
cp .env.example .env.local
```

On Windows without a POSIX shell, copy `.env.example` to `.env.local` using Explorer or your preferred shell. Then edit `.env.local` and explicitly enable the seeded development actor:

```dotenv
DEJAVIEW_LOCAL_AUTH=true
```

`DEJAVIEW_LOCAL_AUTH` is **development-only**. The application ignores it when `NODE_ENV=production`; never use it as a production authentication mechanism.

Prepare and run the application:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Open <http://localhost:3000>. The seed is deterministic and safe to rerun: it restores only its fixed demonstration records and leaves unrelated records intact. It includes a published printer-error article, a linked resolved support case, application/tag metadata and FTS projections. Search for `E42` to exercise the main demo path.

The application also runs pending migrations when it first opens the database. Running the migration command explicitly makes setup and deployment failures visible before the server starts.

## Environment variables

| Variable                 | Required             | Purpose                                                                                                                                    |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`           | No                   | SQLite file path; defaults to `./data/dejaview.sqlite`. Relative paths resolve from the project root.                                      |
| `DEJAVIEW_LOCAL_AUTH`    | Local mutations only | Set exactly `true` to use the seeded editor outside production. Leave `false` in shared or production environments.                        |
| `DEJAVIEW_CURSOR_SECRET` | Production           | Secret used to sign search cursors. Production search fails without it. Use a long random value supplied by the deployment secret manager. |
| `JIRA_BASE_URL`          | Jira only            | Origin-only `https://<tenant>.atlassian.net` URL. Supplying it enables Jira configuration validation.                                      |
| `JIRA_EMAIL`             | Jira only            | Email address of the least-privileged Jira service account.                                                                                |
| `JIRA_API_TOKEN`         | Jira only            | Jira API token; server-side secret.                                                                                                        |
| `JIRA_PROJECT_KEYS`      | Jira only            | Comma-separated uppercase project-key allow-list, for example `SUP,OPS`.                                                                   |
| `JIRA_SOURCE_LABEL`      | No                   | Display label for Jira results; defaults to `Jira`. It does not change canonical source identity.                                          |
| `JIRA_TIMEOUT_MS`        | No                   | Per-request timeout from 100 to 30,000 ms; defaults to `5000`.                                                                             |

`JIRA_EMAIL`, `JIRA_API_TOKEN`, `DEJAVIEW_CURSOR_SECRET` and any real tenant details belong in `.env.local` for local work or, preferably, a deployment secret manager. Do not commit them. If `JIRA_BASE_URL` is absent, the Jira provider is simply not registered. If it is present, all required Jira values must pass strict validation.

## Database operations

Production database changes use ordered, handwritten SQL migrations recorded with SHA-256 checksums. Applied migrations are immutable; do not use `drizzle-kit push`.

```sh
npm run db:migrate       # apply pending checksum-verified migrations
npm run db:seed          # restore deterministic demonstration records
npm run search:reindex   # rebuild search projections and the FTS5 index
```

Run `search:reindex` after a restore or when projection consistency is in doubt. It is not a normal prerequisite for every start.

### SQLite persistence, backup and deployment limits

- `DATABASE_URL` is persistent application state. Mount or retain its containing directory across deployments.
- Run only **one writable DejaView application instance** against a database file. SQLite is not a horizontal multi-writer deployment solution.
- WAL mode, foreign keys and a busy timeout are enabled. The database may have adjacent `-wal` and `-shm` files while open.
- Before an offline backup, stop DejaView and copy the database plus matching `-wal` and `-shm` files together. For an online backup, use SQLite's supported backup command/API rather than copying a live file in isolation.
- Protect database files and backups with host filesystem permissions and encryption at rest. Test restoration regularly.
- To restore, stop DejaView, retain the failed files for investigation, restore a consistent database/WAL/SHM set, run `npm run db:migrate` and `npm run search:reindex`, then verify health and an `E42`-style search before reopening access.

## Jira Cloud

Jira uses the canonical source ID `jira` and provider type `jira`; `JIRA_SOURCE_LABEL` changes presentation only. The project-key allow-list applies to search, detail, comments and promotion. DejaView constructs escaped JQL from ordinary search input and never accepts raw JQL.

Automated tests use mocked Jira HTTP responses. They verify request construction, sanitised failures, safe ADF conversion, lazy detail/comments, pagination and promotion without requiring credentials. The project has **not** been live-verified in this checkout because no Jira credentials are supplied, and the test results must not be represented as live verification.

For a live smoke test, supply the four required Jira values through the environment, use a non-production project and a least-privileged account, then verify:

1. `/search` returns clearly labelled Jira results for an allowed project;
2. an issue opens with a safely rendered description;
3. comments load only after request and paginate without entering promotion data;
4. **Promote to draft** refetches the issue, creates one local draft and opens the same draft on repetition;
5. removing or invalidating Jira credentials leaves internal results visible with a sanitised partial-failure warning.

Never paste tokens into documentation, screenshots, URLs, browser code or logs. See [`docs/providers.md`](docs/providers.md) for exact constraints.

## Security model

- The current MVP is intended for a trusted internal network behind HTTPS.
- Read routes are available to the application UI. Mutations require an actor; editor/admin operations and feedback are role-checked as appropriate.
- This repository ships only the explicit local development identity adapter. In production it returns no actor, so mutations are unauthenticated until the deployment is wired to a real identity provider/reverse proxy that resolves DejaView actor identities. Do not expose the MVP publicly without that integration and an access-control review.
- Mutation routes reject cross-origin browser requests. Jira promotion additionally requires explicit same-origin browser evidence.
- Zod validates HTTP input, environment/provider configuration and bounded upstream payloads. SQL is parameterised; FTS queries and JQL use dedicated escaping.
- Jira credentials remain server-side. Redirects are not followed, responses are size-bounded, errors are sanitised and upstream rich text is converted to an allow-listed AST. The UI does not render upstream HTML.
- Search cursors are signed. `DEJAVIEW_CURSOR_SECRET` is mandatory in production to prevent reliance on the development fallback.
- Promoted content is untrusted and always starts as a draft for human review. Secrets and raw provider payloads are not stored in provenance.

## API overview

Successful responses use `{ data, meta }`; errors use `{ error: { code, message, fieldErrors?, requestId } }`. Mutation bodies are JSON. Article and case updates require the current `version` for optimistic concurrency.

```text
GET    /api/v1/health
GET    /api/v1/search?q=...&source=...&application=...&tag=...&dateFrom=...&dateTo=...&status=...&limit=...&cursor=...

GET    /api/v1/articles
POST   /api/v1/articles/quick
GET    /api/v1/articles/:id
PATCH  /api/v1/articles/:id
POST   /api/v1/articles/:id/publish
GET    /api/v1/articles/:id/feedback
POST   /api/v1/articles/:id/feedback
GET    /api/v1/articles/:id/related

GET    /api/v1/cases
POST   /api/v1/cases
GET    /api/v1/cases/:id
PATCH  /api/v1/cases/:id
POST   /api/v1/cases/:id/resolve
POST   /api/v1/cases/:id/draft-article

GET    /api/v1/providers/jira/search?q=...&project=...&limit=...
GET    /api/v1/providers/jira/issues/:key
GET    /api/v1/providers/jira/issues/:key?includeComments=true&cursor=0
POST   /api/v1/providers/jira/issues/:key/promote
```

The unified search endpoint accepts `source=knowledge|support_case|external|jira`; `status` is `published` or `resolved`. Consult route schemas for complete payload contracts and limits.

## Quality checks

```sh
npm run test
npm run boundary:check
npm run typecheck
npm run format:check
npm run lint
npm run build
npm run test:e2e
npm audit --omit=dev
```

Playwright installs browser binaries separately when needed (`npx playwright install`). End-to-end tests start the application using their test configuration; do not point them at production data.

## PostgreSQL migration seams

SQLite is behind repository, unit-of-work and search ports. Domain/application code does not depend on SQLite row IDs or FTS rank types; UUIDs and ISO 8601 UTC strings are portable. A PostgreSQL migration would add Drizzle PostgreSQL repositories, transaction handling and a `tsvector` (or other) search adapter behind the existing contracts, migrate data, and change deployment composition. It should preserve `/api/v1`, actor, provider and provenance contracts. PostgreSQL support is a seam, not an implemented feature.

## Non-goals

The MVP deliberately does **not** include:

- AI-generated answers, LLM summarisation, embeddings or semantic/vector search;
- background, bidirectional or webhook-driven Jira synchronisation;
- editing Jira, automatic publication or automatic trust of external content;
- microservices, horizontal multi-writer SQLite, multi-tenancy or public self-registration;
- attachments, OCR, arbitrary web ingestion, offline browser mode or real-time collaborative editing.

## Contributing

1. Create a focused branch and keep changes within the domain/application/infrastructure boundaries.
2. Add or update tests for behaviour changes; use British English in user-facing copy and documentation.
3. Never commit `.env.local`, credentials, database files or backups.
4. Run the quality checks above. For schema changes, add a new ordered migration; never edit an applied migration or use `drizzle-kit push`.
5. Explain security, persistence, API and migration effects in the change description.

## Dependency audit

`npm audit` may report moderate development-only findings below `drizzle-kit` through its legacy esbuild tooling chain. The affected tooling is not shipped in the production application; use `npm audit --omit=dev` as the production dependency gate. Do not apply a forced breaking downgrade merely to suppress development-tool findings. Review and upgrade the maintained chain normally when a compatible release resolves them.

## Licence

DejaView is released under the [MIT License](LICENSE).
