# DejaView

DejaView is a local-first knowledge capture and federated search application. It starts with the problem a user is trying to solve — a symptom, application name, exact error or quoted phrase — rather than asking them to browse a hierarchy. It combines reusable local knowledge with optional Jira Cloud results in one clearly labelled result set.

## MVP features

- Problem-first search across published knowledge articles and an optional Jira Cloud provider.
- SQLite FTS5 search with exact-term handling, filters, deterministic ranking, pagination and partial-provider-failure warnings.
- Quick article capture, structured step editing, draft publication, applications, tags and related knowledge.

- Useful/not-useful article feedback, optional difference notes and usage counts.
- Lazy Jira issue detail and paginated comments, with safe Atlassian Document Format rendering.
- Explicit, duplicate-safe promotion of a fresh Jira issue snapshot into a local **Draft** article.
- Versioned JSON API, input validation, optimistic concurrency and same-origin mutation checks.
- Visible, provider-neutral provenance for local and imported articles, including exact safe source backlinks.
- Deterministic, idempotent demonstration data for a published article. Search for `E42` after seeding.

## Architecture

DejaView is a modular monolith: one Next.js 16 application, one Node.js process and one SQLite database. The App Router UI and `/api/v1` route handlers call application services; domain contracts sit inside infrastructure adapters for Drizzle/SQLite, FTS5 and external providers. Dependencies point inwards:

```text
app and infrastructure -> application -> domain
```

The server uses the Node.js runtime because `better-sqlite3` is native and process-local. Provider searches run alongside internal search and fail independently, so an unavailable Jira connection does not hide successful local results.

See [`docs/architecture.md`](docs/architecture.md) for the baseline decisions and schema, and [`docs/providers.md`](docs/providers.md) for the implemented provider contract and Jira details.

## Prerequisites

- Node.js 24 or later (Node.js 24 LTS and Node.js 26 are tested; `.nvmrc` selects Node.js 26)
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

Open <http://localhost:3000>. The seed is deterministic and safe to rerun: it restores only its fixed demonstration records and leaves unrelated records intact. It includes a published printer-error article with internal provenance, application/tag metadata and an FTS projection. Search for `E42` to exercise the main demo path.

The application also runs pending migrations when it first opens the database. Running the migration command explicitly makes setup and deployment failures visible before the server starts.

## Environment variables

| Variable                            | Required             | Purpose                                                                                                                                                            |
| ----------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                      | No                   | SQLite file path; defaults to `./data/dejaview.sqlite`. Relative paths resolve from the project root.                                                              |
| `DEJAVIEW_LOCAL_AUTH`               | Local mutations only | Set exactly `true` to use the seeded editor outside production. Leave `false` in shared or production environments.                                                |
| `DEJAVIEW_CURSOR_SECRET`            | Production           | Secret used to sign search cursors. Production search fails without it. Use a long random value supplied by the deployment secret manager.                         |
| `AUTH_SECRET`                       | Production           | At least 32 random bytes used to encrypt and sign authentication cookies.                                                                                          |
| `AUTH_URL`                          | Production           | Public origin, for example `https://dejaview.example.com`.                                                                                                         |
| `AUTH_MICROSOFT_ENTRA_ID_ID`        | Production           | Entra application (client) ID.                                                                                                                                     |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET`    | Production           | Entra client secret value.                                                                                                                                         |
| `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` | Production           | Microsoft Entra tenant ID; DejaView is single-tenant.                                                                                                              |
| `DEJAVIEW_ENTRA_READER_GROUP_ID`    | Production           | Entra object ID of the synchronised AD reader group.                                                                                                               |
| `DEJAVIEW_ENTRA_EDITOR_GROUP_ID`    | Production           | Entra object ID of the synchronised AD editor group.                                                                                                               |
| `DEJAVIEW_ENTRA_ADMIN_GROUP_ID`     | Production           | Entra object ID of the synchronised AD administrator group.                                                                                                        |
| `JIRA_BASE_URL`                     | Jira only            | Origin-only `https://<tenant>.atlassian.net` URL. Supplying it enables Jira configuration validation.                                                              |
| `JIRA_EMAIL`                        | Jira only            | Email address of the least-privileged Jira service account.                                                                                                        |
| `JIRA_API_TOKEN`                    | Jira only            | Jira API token; server-side secret.                                                                                                                                |
| `JIRA_PROJECT_KEYS`                 | Jira only            | Comma-separated uppercase project-key allow-list, for example `SUP,OPS`.                                                                                           |
| `JIRA_PROJECT_COLOURS`              | No                   | Comma-separated project pill colours, for example `SUP:#2563EB,OPS:#059669`. Keys must be unique members of `JIRA_PROJECT_KEYS`; values are six-digit hex colours. |
| `JIRA_SOURCE_LABEL`                 | No                   | Display label for Jira results; defaults to `Jira`. It does not change canonical source identity.                                                                  |
| `JIRA_TIMEOUT_MS`                   | No                   | Per-request timeout from 100 to 30,000 ms; defaults to `5000`.                                                                                                     |

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
3. comments load only after request and remain unselected by default;
4. selected comments can be imported as supporting context or instruction steps, with a maximum of 20 selections and ten authoritative Jira pages checked;
5. **Promote to draft** refetches the issue and selected comments and creates one local draft; a repeated import without comments opens the existing draft, while selected additions to an existing draft are rejected explicitly;
6. removing or invalidating Jira credentials leaves internal results visible with a sanitised partial-failure warning.

Never paste tokens into documentation, screenshots, URLs, browser code or logs. See [`docs/providers.md`](docs/providers.md) for exact constraints.

## Microsoft Entra authentication

Production uses Microsoft Entra ID OpenID Connect with on-premises AD security groups synchronised into Entra. Register a **single-tenant Web application** with this redirect URI:

```text
https://dejaview.example.com/api/auth/callback/microsoft-entra-id
```

In the Enterprise Application:

1. Set **Assignment required?** to **Yes**.
2. Assign only the three DejaView security groups.
3. Grant the Microsoft Graph **application permissions** `User.Read.All` and `GroupMember.Read.All`, then grant tenant administrator consent. DejaView uses only `accountEnabled` and `checkMemberGroups`.
4. Under token configuration, group claims may be enabled for defence in depth, but Graph is the runtime authorisation source.
5. Put the three Entra group object IDs in the environment variables above. Role priority is administrator, editor, then reader.

DejaView checks `accountEnabled` and transitive membership of only the three configured groups through Microsoft Graph at sign-in and every five minutes thereafter. A Graph error fails closed until a successful revalidation. This supports nested synchronised AD security groups and bounds access after removal or disablement to five minutes.

Generate independent secrets with `openssl rand -hex 32`. Do not reuse the Jira token or cursor secret.

## Reverse proxy deployment

Run the standalone Node server on a loopback address, for example `127.0.0.1:3000`, and terminate HTTPS at a trusted reverse proxy. Set `AUTH_URL` to the public HTTPS origin and `AUTH_TRUST_HOST=true`. The proxy must replace, rather than accept from an untrusted client, the effective host, scheme and client forwarding headers.

Whichever proxy is used:

- forward every path, including `/api/auth/*` and `/_next/*`, to the same Node process;
- do not expose `.next/static` as an unauthenticated file alias;
- do not publicly cache authenticated HTML, React Server Component responses or JSON;
- allow the Auth.js callback path exactly as registered in Entra;
- bind Node to loopback or otherwise firewall its port from client networks;
- allow only the intended public host name at the HTTPS site or virtual host.

### IIS

IIS is viable using **Application Request Routing (ARR)** and **URL Rewrite 2**. Install both modules, enable **Proxy** in the server-level ARR settings, create a site with the public HTTPS binding, and use this site-level `web.config` as a starting point:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="DejaView reverse proxy" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:3000/{R:1}" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_HOST" value="{HTTP_HOST}" />
            <set name="HTTP_X_FORWARDED_PROTO" value="https" />
          </serverVariables>
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

In IIS Manager, add `HTTP_X_FORWARDED_HOST` and `HTTP_X_FORWARDED_PROTO` to the server-level **URL Rewrite → View Server Variables** allow-list before the rule sets them. ARR supplies the forwarding proxy; the rewrite rule must target loopback and must not be configured as an open forward proxy. If TLS is terminated before IIS, set the forwarded scheme only from that trusted proxy arrangement, not from a client-supplied header.

### Nginx

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Use an exact HTTPS `server_name` and do not add a separate public `alias` for `/_next/static`.

### Apache HTTP Server

Apache HTTP Server 2.4 is viable with `mod_proxy`, `mod_proxy_http` and `mod_headers` enabled:

```apache
<VirtualHost *:443>
    ServerName dejaview.example.com

    SSLEngine on
    # Configure SSLCertificateFile and SSLCertificateKeyFile here.

    ProxyRequests Off
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"

    ProxyPass        / http://127.0.0.1:3000/ retry=0
    ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
```

`ProxyRequests Off` is important because this is a reverse proxy, not a public forward proxy. Apache's HTTP proxy module adds `X-Forwarded-Host`, while `ProxyPreserveHost On` retains the incoming `Host` header. Restrict the virtual host to the intended hostname and do not enable `mod_cache` for authenticated application responses.

After configuring any proxy, verify the public origin redirects an unauthenticated page to `/auth/signin`, an unauthenticated business API returns `401`, and the Microsoft sign-in request uses the expected public HTTPS callback URI.

## Security model

- The current MVP is intended for a trusted internal network behind HTTPS.
- Every page and API route, including health and read-only endpoints, requires an authenticated Entra session and membership of a configured DejaView group. Authentication protocol endpoints and sign-in/error pages are the only public paths.
- Reader, editor and administrator groups grant increasing application roles. Editor or administrator access is required for authoring and promotion; authenticated readers may search, read and submit usefulness feedback.
- `DEJAVIEW_LOCAL_AUTH=true` remains development-only and is ignored in production.
- Mutation routes reject cross-origin browser requests. Jira promotion additionally requires explicit same-origin browser evidence.
- Zod validates HTTP input, environment/provider configuration and bounded upstream payloads. SQL is parameterised; FTS queries and JQL use dedicated escaping.
- Jira credentials remain server-side. Redirects are not followed, responses are size-bounded, errors are sanitised and upstream rich text is converted to an allow-listed AST. The UI does not render upstream HTML.
- Search cursors are signed. `DEJAVIEW_CURSOR_SECRET` is mandatory in production to prevent reliance on the development fallback.
- Promoted content is untrusted and always starts as a draft for human review. Secrets and raw provider payloads are not stored in provenance.

## API overview

Successful responses use `{ data, meta }`; errors use `{ error: { code, message, fieldErrors?, requestId } }`. Mutation bodies are JSON. Article updates require the current `version` for optimistic concurrency.

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


GET    /api/v1/providers/jira/search?q=...&project=...&limit=...
GET    /api/v1/providers/jira/issues/:key
GET    /api/v1/providers/jira/issues/:key?includeComments=true&cursor=0
POST   /api/v1/providers/jira/issues/:key/promote
```

The unified search endpoint accepts `source=knowledge|external|jira`; local search status is `published`. `source=jira` selects the live Jira provider and any imported articles whose canonical provider type is Jira. Consult route schemas for complete payload contracts and limits.

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

## Server database migration seams

SQLite is behind repository, unit-of-work and search ports. Domain/application code does not depend on SQLite row IDs or FTS rank types; UUIDs and ISO 8601 UTC strings are portable. PostgreSQL and Microsoft SQL Server are migration targets, not currently implemented runtime options. Setting a server connection string in the present release will not switch the application away from SQLite.

### PostgreSQL

A PostgreSQL migration would add Drizzle PostgreSQL schemas and repositories, asynchronous transaction handling and a `tsvector` (or other) search adapter behind the existing contracts. It must migrate and reconcile every source row before cutover while preserving `/api/v1`, actor, provider and provenance contracts.

### Microsoft SQL Server

SQL Server is viable, but this is an application migration rather than a connection-string-only deployment change. The present repositories, migrations and FTS5 search adapter contain SQLite-specific SQL and synchronous `better-sqlite3` calls.

An implementation should:

1. Add SQL Server table definitions and repositories behind the existing ports. Translate SQLite text, integer/boolean and timestamp representations deliberately to `nvarchar`, `bit` and either `datetimeoffset` or a documented ISO 8601 text representation.
2. Replace process-local synchronous transactions with an awaited SQL Server connection pool and transactions. Keep one shared pool per Node process and use parameterised queries.
3. Create a separate ordered, checksum-verified T-SQL migration set. Do not run the existing SQLite migration files against SQL Server and do not use `drizzle-kit push` in production.
4. Install the SQL Server **Full-Text Search** Database Engine component and implement a SQL Server search adapter, normally using a full-text catalogue/index and `CONTAINSTABLE`. Preserve exact-term, filtering, deterministic ranking and cursor behaviour with database-specific integration tests. SQL Server and SQLite use different tokenisation and ranking, so FTS5 SQL cannot be translated mechanically.
5. Build a repeatable SQLite-to-SQL Server transfer command that reads a consistent SQLite backup, inserts tables in foreign-key order, preserves IDs, versions, timestamps, users and provenance, and reports per-table counts and rejected rows. Do not point production at the target yet.
6. Rebuild the SQL Server search projection, compare source and target row counts, sample complete aggregates and run API, authorisation, mutation, search and rollback tests against the target.
7. Stop writes, take a final consistent SQLite backup, run a final incremental or full transfer, repeat reconciliation, then change the database provider and restart. Retain the SQLite backup for rollback.

#### Packages

Drizzle's SQL Server documentation currently uses its release-candidate channel with the `mssql` driver. The repository currently pins stable `drizzle-orm` and `drizzle-kit`, and that stable ORM package does not expose the documented `node-mssql`/`mssql-core` entry points. Implement and test the migration on a branch before changing these versions:

```sh
npm install drizzle-orm@rc mssql
npm install --save-dev drizzle-kit@rc @types/mssql
```

The default `mssql` transport uses the cross-platform `tedious` driver and requires SQL Server TCP/IP access. If deployment specifically requires integrated authentication as the Node service identity, evaluate `mssql/msnodesqlv8` separately and install the matching Microsoft ODBC driver; do not assume IIS authentication is automatically passed to the separate Node process.

#### Proposed environment variables

These variables are the recommended contract for the SQL Server adapter. They are documentation for that future adapter and are not consumed by the current SQLite implementation:

| Variable                         | Required for SQL Server | Purpose                                                                                                                                       |
| -------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_PROVIDER`              | Yes                     | Set to `sqlserver`; retain `sqlite` as the default during development and migration rehearsal.                                                |
| `DATABASE_URL`                   | Yes                     | Secret SQL Server connection string, for example `Server=tcp:sql.example.com,1433;Database=dejaview;User Id=...;Password=...;Encrypt=true`.   |
| `DATABASE_TRUST_SERVER_CERT`     | No                      | Default `false`. Permit `true` only for a controlled local environment using a self-signed certificate, never as a production TLS workaround. |
| `DATABASE_POOL_MAX`              | No                      | Maximum connections in the Node process pool; choose against SQL Server capacity and the number of application processes.                     |
| `DATABASE_CONNECTION_TIMEOUT_MS` | No                      | Connection timeout in milliseconds.                                                                                                           |
| `DATABASE_REQUEST_TIMEOUT_MS`    | No                      | Query timeout in milliseconds.                                                                                                                |

Keep credentials in the deployment secret manager rather than a committed `.env` file. Use an application-specific least-privilege login, require encrypted transport, validate the SQL Server certificate and restrict network access to the application host. If the adapter uses a structured driver configuration rather than a connection string, equivalent secret variables for server, port, database, user and password may be introduced, but do not support two ambiguous configuration formats at once.

References: [Drizzle SQL Server guide](https://orm.drizzle.team/docs/get-started/mssql-existing), [`node-mssql`](https://www.npmjs.com/package/mssql), [Microsoft SQL Server Full-Text Search](https://learn.microsoft.com/en-us/sql/relational-databases/search/full-text-search) and [Microsoft's Node.js connection prerequisites](https://learn.microsoft.com/en-us/sql/connect/node-js/step-3-proof-of-concept-connecting-to-sql-using-node-js).

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
