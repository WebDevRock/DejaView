# DejaView architecture gate

Status: **approved baseline for Phase 1 implementation**  
Scope: local-first knowledge capture and federated support search  
Language: British English

## 1. Architecture

DejaView is a **modular monolith**: one deployable Next.js application, one Node.js process and one SQLite database. Modules are separated by dependency rules rather than separate services.

```text
Browser
  -> Next.js App Router UI
  -> REST /api/v1 route handlers (transport/adapters)
  -> application services/use-cases
  -> domain model and ports
  -> infrastructure adapters
       -> SQLite/FTS5
       -> external search providers (initially Jira)
```

### Dependency rules

- `domain` contains entities, value objects, policies and repository/provider interfaces. It imports neither Next.js nor SQLite libraries.
- `application` orchestrates use-cases and transactions through domain ports. It imports neither Next.js nor SQLite libraries.
- `infrastructure` implements ports using Drizzle, `better-sqlite3`, FTS5 and native `fetch`.
- `app` owns React pages, route handlers, HTTP validation, authentication context and dependency composition.
- Dependencies point inward: `app/infrastructure -> application -> domain`.
- Route handlers are thin: parse and validate, invoke one application use-case, then map its result to an HTTP response.
- No business rule lives only in a React component, route handler, Drizzle query or provider adapter.
- REST endpoints are versioned under `/api/v1`; UI code uses the same application contract rather than reaching into database adapters.

### Runtime and delivery shape

- Next.js runs in the **Node.js runtime**, not Edge, because `better-sqlite3` is native and process-local.
- SQLite is suitable for a single writable application instance. Horizontal multi-writer deployment is deferred until the PostgreSQL seam is used.
- Database access is server-only. React Server Components may call application services; browser components call `/api/v1`.
- Mutations use explicit database transactions. WAL mode, foreign keys and a busy timeout are enabled at connection start.

## 2. Exact technology and libraries

| Concern | Decision |
|---|---|
| Runtime | Node.js 22 LTS |
| Package manager | npm, with committed `package-lock.json` |
| Web framework | Next.js 16 App Router |
| UI | React 19, React DOM 19, TypeScript (`strict: true`) |
| Styling | Tailwind CSS |
| Validation/contracts | Zod |
| Relational access | Drizzle ORM and `drizzle-orm/better-sqlite3` |
| SQLite driver | `better-sqlite3` |
| Migrations | handwritten, ordered SQL files; Drizzle schema is the typed query model |
| Full-text search | SQLite FTS5, created and maintained by handwritten SQL migrations |
| HTTP client | Node native `fetch`; no Axios |
| Unit/integration tests | Vitest |
| Component tests | React Testing Library plus `@testing-library/jest-dom` and `user-event` |
| HTTP mocking | MSW |
| End-to-end tests | Playwright |
| IDs | `crypto.randomUUID()` producing UUID strings stored as `TEXT` |
| Time | ISO 8601 UTC strings (for example `2026-08-28T09:15:00.000Z`) stored as `TEXT` |

Install current compatible releases within these fixed major/runtime decisions. Pin resolved versions in `package-lock.json`; dependency upgrades are reviewed separately.

## 3. Folder tree

```text
DejaView/
├─ docs/
│  └─ architecture.md
├─ migrations/
│  ├─ 0001_initial.sql
│  └─ 0002_search_fts.sql
├─ public/
├─ src/
│  ├─ app/
│  │  ├─ (ui)/
│  │  ├─ api/v1/
│  │  │  ├─ search/route.ts
│  │  │  ├─ articles/route.ts
│  │  │  ├─ articles/[id]/route.ts
│  │  │  ├─ articles/[id]/publish/route.ts
│  │  │  ├─ articles/[id]/feedback/route.ts
│  │  │  ├─ support-cases/route.ts
│  │  │  ├─ support-cases/[id]/route.ts
│  │  │  ├─ external-sources/route.ts
│  │  │  └─ external-results/promote/route.ts
│  │  ├─ layout.tsx
│  │  └─ page.tsx
│  ├─ domain/
│  │  ├─ knowledge/
│  │  ├─ support/
│  │  ├─ search/
│  │  ├─ sources/
│  │  └─ identity/
│  ├─ application/
│  │  ├─ ports/
│  │  ├─ articles/
│  │  ├─ support-cases/
│  │  └─ search/
│  ├─ infrastructure/
│  │  ├─ db/{client,schema,repositories}.ts
│  │  ├─ search/{fts5-search-repository,unified-search}.ts
│  │  ├─ providers/{registry,jira}/
│  │  └─ content/{safe-ast,plain-text}.ts
│  ├─ presentation/
│  │  ├─ components/
│  │  └─ api-client/
│  └─ composition/root.ts
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ component/
│  ├─ e2e/
│  └─ fixtures/
├─ drizzle.config.ts
├─ next.config.ts
├─ package.json
├─ playwright.config.ts
├─ tsconfig.json
└─ vitest.config.ts
```

A lint rule or dependency-cruiser check must reject imports of `next*`, `better-sqlite3`, Drizzle and `src/infrastructure` from `src/domain` or `src/application`.

## 4. Initial database schema

All primary and foreign IDs are UUIDs represented by non-null `TEXT`. All timestamps are UTC ISO text. Every table has `created_at`; mutable records also have `updated_at`. Foreign keys are enforced. Destructive cascades are limited to owned children and join rows.

### Identity/actor seam

- `users(id PK, external_subject TEXT UNIQUE, display_name TEXT NOT NULL, email TEXT UNIQUE, status TEXT NOT NULL CHECK status IN ('active','disabled'), created_at, updated_at)`.
- `external_subject` is the future identity-provider subject; Phase 1 may seed one local user.
- Actor columns such as `created_by_user_id`, `updated_by_user_id`, `published_by_user_id` and `submitted_by_user_id` reference `users(id)` and use `ON DELETE RESTRICT`.

### Knowledge

- `knowledge_articles(id PK, stable_key TEXT NOT NULL UNIQUE, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', problem TEXT NOT NULL DEFAULT '', symptoms TEXT NOT NULL DEFAULT '', resolution_summary TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft' CHECK status IN ('draft','published','deprecated','archived'), version INTEGER NOT NULL DEFAULT 1 CHECK version >= 1, use_count INTEGER NOT NULL DEFAULT 0 CHECK use_count >= 0, last_used_at TEXT NULL, created_by_user_id FK, updated_by_user_id FK, published_by_user_id FK NULL, published_at TEXT NULL, created_at, updated_at, CHECK published state and published fields agree)`.
- Persistence status values map directly to the domain/API values `Draft`, `Published`, `Deprecated` and `Archived`.
- `knowledge_steps(id PK, article_id FK knowledge_articles ON DELETE CASCADE, stable_key TEXT NOT NULL, position INTEGER NOT NULL CHECK position >= 0, step_type TEXT NOT NULL CHECK step_type IN ('instruction','check','decision','sql','powershell','code','url','warning','expected_result'), title TEXT NULL, instruction TEXT NOT NULL, code TEXT NULL, notes TEXT NULL, body_ast_json TEXT NOT NULL, body_plain_text TEXT NOT NULL, created_at, updated_at, UNIQUE(article_id, stable_key), UNIQUE(article_id, position))`.
- Step UUID and per-article `stable_key` do not change when steps are reordered; `position` is display order only.
- `step_edges(id PK, article_id FK knowledge_articles ON DELETE CASCADE, from_step_id FK knowledge_steps ON DELETE CASCADE, to_step_id FK knowledge_steps ON DELETE CASCADE, edge_type TEXT NOT NULL CHECK edge_type IN ('next','branch','related'), label TEXT NULL, created_at, UNIQUE(from_step_id,to_step_id,edge_type), CHECK(from_step_id <> to_step_id))`. Application validation ensures both steps belong to `article_id` and rejects invalid `next` cycles.
- `applications(id PK, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at, updated_at)`.
- `article_applications(article_id FK ON DELETE CASCADE, application_id FK ON DELETE CASCADE, created_at, PRIMARY KEY(article_id,application_id))`.
- `tags(id PK, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL UNIQUE, created_at, updated_at)`.
- `article_tags(article_id FK ON DELETE CASCADE, tag_id FK ON DELETE CASCADE, created_at, PRIMARY KEY(article_id,tag_id))`.

### Cases, provenance and feedback

- `support_cases(id PK, stable_key TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT NOT NULL, occurred_at TEXT NOT NULL, resolution_notes TEXT NOT NULL DEFAULT '', article_id FK knowledge_articles ON DELETE SET NULL, status TEXT NOT NULL CHECK status IN ('open','resolved','closed'), created_by_user_id FK, resolved_by_user_id FK NULL, resolved_at TEXT NULL, created_at, updated_at, CHECK resolved status and resolved fields are coherent)`.
- `knowledge_source_links(id PK, article_id FK knowledge_articles ON DELETE CASCADE, source_kind TEXT NOT NULL CHECK source_kind IN ('support_case','external_item','manual'), support_case_id FK support_cases ON DELETE SET NULL, external_source_id FK external_sources ON DELETE SET NULL, external_item_key TEXT NULL, external_url TEXT NULL, source_title TEXT NULL, captured_at TEXT NOT NULL, snapshot_text TEXT NULL, created_at, CHECK exactly the fields required by source_kind are present)`.
- This generic provenance record deliberately contains no Jira-specific columns.
- `article_feedback(id PK, article_id FK knowledge_articles ON DELETE CASCADE, submitted_by_user_id FK, outcome TEXT NOT NULL CHECK outcome IN ('yes','no'), difference_note TEXT NULL, created_at)`. The difference note is always optional. Submitting **yes** transactionally inserts the feedback row, increments `knowledge_articles.use_count`, sets `last_used_at` to the submission time and refreshes `updated_at`; **no** records feedback without changing usage counters.

### External sources

- `external_sources(id PK, provider_type TEXT NOT NULL, name TEXT NOT NULL UNIQUE, enabled INTEGER NOT NULL DEFAULT 1 CHECK enabled IN (0,1), base_url TEXT NOT NULL, config_json TEXT NOT NULL DEFAULT '{}', secret_env_ref TEXT NOT NULL, created_at, updated_at)`.
- `config_json` holds non-secret options only, such as Jira project keys and allowed issue types. `secret_env_ref` stores an environment-variable name, never a token, password or cookie.
- Provider-specific configuration is parsed by a Zod schema selected by `provider_type`; unknown keys are rejected.

### Search projection and FTS5

- `search_documents(id TEXT PK, entity_type TEXT NOT NULL CHECK entity_type IN ('article','support_case'), entity_id TEXT NOT NULL, source_label TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, exact_terms TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(entity_type,entity_id))`.
- `search_documents_fts` is an FTS5 external-content virtual table over `search_documents`, indexing `title`, `body` and `exact_terms`; IDs/status/source labels remain unindexed metadata in the content table.
- Handwritten migration SQL creates FTS5, insert/update/delete synchronisation triggers and runs `INSERT INTO search_documents_fts(search_documents_fts) VALUES ('rebuild')`.
- Application writes update canonical records and `search_documents` in the same transaction. Triggers keep only the FTS index in step with that projection.

### Low-friction quick-create contract

`POST /api/v1/articles/quick` accepts only `problem`, optional `applications`, optional `symptomsOrError`, required `whatFixedIt`, and optional `tags`. The server generates the article UUID and stable key, applies `draft`, `use_count = 0`, timestamps and the authenticated actor, maps the problem/symptoms fields, and converts `whatFixedIt` into one `instruction` step plus its safe AST/plain-text projections. The draft can be enhanced with further steps later. No user must supply IDs, status, actor metadata, AST or projection fields.

### Required indexes

Besides primary, unique and join-table indexes:

```text
knowledge_articles(status, updated_at)
knowledge_steps(article_id, position)
step_edges(article_id, from_step_id)
step_edges(article_id, to_step_id)
support_cases(status, updated_at)
knowledge_source_links(article_id)
knowledge_source_links(external_source_id, external_item_key)
article_feedback(article_id, created_at)
search_documents(entity_type, entity_id)
search_documents(status, updated_at)
external_sources(enabled, provider_type)
```

Migrations use `PRAGMA foreign_keys=ON`, `journal_mode=WAL` and `busy_timeout`. Migration execution records filename and SHA-256 checksum in `schema_migrations`; an applied migration is immutable.

## 5. Unified FTS5 and provider architecture

### Contracts

The application layer owns a provider-neutral `SearchQuery`, `SearchResult` and `SearchProvider` port. A result includes stable result ID, kind, title, snippet, URL/reference, source label, status, score, exact-match signals and provider metadata safe for clients. Provider secrets and raw payloads never cross the adapter boundary.

`UnifiedSearchService`:

1. validates and normalises the provider-neutral `SearchQuery`, containing text plus optional `source`, `application`, `tag`, `dateFrom`, `dateTo` and `status` filters, without destroying exact error codes or quoted phrases;
2. starts the internal FTS5 search and every enabled external provider concurrently using `Promise.allSettled`;
3. applies per-provider timeout/abort signals and result limits;
4. converts fulfilled results into the common shape and failed calls into sanitised provider warnings;
5. de-duplicates by canonical internal identity or `(provider source, external key)`;
6. orders deterministic ranking tiers: **exact error/signature matches**, then **published knowledge articles**, then **resolved support cases**, then **external results**;
7. sorts within a tier by exact phrase/token match, provider/FTS relevance, freshness and stable ID;
8. returns results with visible source labels plus `partial: true` and warnings when any provider fails.

An empty successful provider response is not a failure. Internal search failure is reported as partial if external results remain, rather than hiding those results. The API never returns provider credentials or raw upstream errors. Source and status filter canonical search rows; application and tag filters use indexed `EXISTS` queries against article join tables; date ranges use article `updated_at`, case `resolved_at`, and external result `updatedAt`. Providers declare unsupported filters and are excluded rather than returning misleading results.

FTS input is compiled into a safely quoted FTS5 expression; user text is never interpolated as SQL. `snippet()`/`highlight()` output is treated as text, not trusted HTML.

### Jira provider (Phase 1 external provider)

- The adapter builds JQL from typed inputs; literals are escaped centrally and field/operator names come only from allow-lists. Raw user-supplied JQL is not accepted.
- The search call requests lightweight fields only: issue key, summary, status, project, issue type and updated time.
- Full issue description and comments are fetched lazily when a user opens a result or elects to promote it.
- Jira Atlassian Document Format is parsed into a small safe internal AST (paragraph, text, heading, list, list item, code block, link, hard break). Unknown nodes degrade to their safe child text. Links permit only `http`/`https` URLs.
- The AST renderer creates React elements; it never uses `dangerouslySetInnerHTML`. A plain-text projection is generated for search and provenance snapshots.
- Promotion creates a **draft** article through an application use-case and adds a generic `knowledge_source_links` record containing source ID, external key/URL, capture time and sanitised snapshot. A user reviews and publishes it separately.
- There is **no background or bidirectional sync**. Later Jira changes do not silently alter promoted knowledge.

### REST API surface

```text
GET    /api/v1/search?q=...&source=...&application=...&tag=...&dateFrom=...&dateTo=...&status=...
GET    /api/v1/articles
POST   /api/v1/articles
GET    /api/v1/articles/:id
PATCH  /api/v1/articles/:id
POST   /api/v1/articles/:id/publish
POST   /api/v1/articles/:id/feedback
GET    /api/v1/support-cases
POST   /api/v1/support-cases
GET    /api/v1/support-cases/:id
PATCH  /api/v1/support-cases/:id
GET    /api/v1/external-sources
POST   /api/v1/external-results/promote
```

JSON responses use `{ data, meta }`; errors use `{ error: { code, message, fieldErrors?, requestId } }`. Create operations return `201`, invalid input `400`, unauthenticated `401`, forbidden `403`, missing `404`, version conflict `409`, and unexpected/upstream-only failure `500`/`502`. PATCH requires the current `version` for optimistic concurrency.

## 6. Difficult-to-reverse choices and seams

- **Modular monolith first:** preserves transactional simplicity. Module boundaries and ports make later extraction possible, but no service split is planned for Phase 1.
- **SQLite now, PostgreSQL later:** repositories and a unit-of-work/transaction port hide Drizzle/SQLite. Domain and application code use no SQLite types, SQL syntax, row IDs or FTS5 rank types. A PostgreSQL adapter can replace persistence without changing use-cases.
- **FTS5 as an adapter:** application search consumes a `KnowledgeSearchPort`. PostgreSQL `tsvector`, OpenSearch or another engine can replace it behind the same result contract.
- **Provider registry:** provider type selects a configuration validator and `SearchProvider` factory. Core search and provenance remain provider-neutral.
- **Portable identity/time:** TEXT UUIDs and ISO UTC TEXT timestamps avoid coupling data to SQLite integer row IDs or timestamp functions. Validate canonical UUID/ISO form at boundaries.
- **Stable content identity:** article/step UUIDs and stable keys survive reordering and editing. Published version history/audit is not implemented yet, but IDs must not be regenerated during edits.
- **Safe internal content AST:** external rich text is normalised before storage/rendering. Persisted AST must carry a schema version to permit future migrations.
- **REST v1 contract:** UI and integrations rely on explicit DTOs, not database rows. Breaking changes require a new version or compatibility period.
- **Secrets by reference:** secret values remain in deployment environment/secret management; they are never persisted or echoed.

## 7. Security assumptions and explicit non-goals

### Security assumptions

- Phase 1 is deployed as a trusted internal application behind HTTPS and an authenticating reverse proxy or identity provider.
- Each request resolves an authenticated subject to `users`; local development may use an explicitly enabled seeded actor only.
- Authorisation starts with `reader`, `editor` and `admin`: readers search/view/leave feedback, editors manage drafts/cases and publish, admins configure sources.
- State-changing routes require same-origin checks and secure, HTTP-only, SameSite cookies when cookie auth is used.
- Zod validates body, path, query, environment and external configuration. Payload lengths, result counts and provider timeouts are bounded.
- Drizzle parameterisation/SQL parameters are mandatory. FTS and JQL have dedicated escaping compilers.
- Provider errors, logs and telemetry are redacted. Audit-worthy mutations record actor and time.
- Stored external content is untrusted and rendered only through the safe AST/plain-text pipeline.
- SQLite database and backups require filesystem access controls and encryption at rest supplied by the host platform.

### Non-goals for Phase 1

- Microservices, event buses, CQRS or distributed transactions.
- Multi-tenant data isolation or public self-registration.
- Horizontal multi-writer deployment or PostgreSQL implementation.
- Semantic/vector search, embeddings or LLM-generated answers.
- Jira synchronisation, webhooks, editing Jira, raw JQL or generic arbitrary HTTP connectors.
- Attachments, binary ingestion, OCR or indexing arbitrary web pages.
- Collaborative real-time editing, comments, approval workflows or complete revision history.
- Offline browser mode, mobile applications or a public API guarantee.
- Automated trust of external content or automatic publication of promoted drafts.

## 8. Phase 1 scaffold and MVP sequencing

Each stage must leave tests green and the application runnable; do not build provider features before internal end-to-end search works.

1. **Scaffold:** create Next.js 16/React 19/TypeScript project with npm, Node 22 engine, Tailwind, strict TypeScript, formatting/linting, Vitest/RTL/MSW and Playwright. Add import-boundary enforcement and a health page/test.
2. **Persistence foundation:** add `better-sqlite3`, Drizzle typed schema, connection pragmas, checksum migration runner and the handwritten initial/FTS5 SQL migrations. Test migrations on a fresh database and upgrade path.
3. **Domain/application core:** implement actor context, articles, stable steps/edges, applications, tags, support cases, provenance and feedback ports/use-cases. Unit-test invariants without Next.js or SQLite.
4. **SQLite adapters:** implement repositories, transactions and search projection writes. Integration-test constraints, rollback, cascade behaviour, UUID/time round-trips and FTS trigger consistency.
5. **Internal authoring MVP:** implement `/api/v1` article/case routes and minimal UI to create/edit a draft, reorder stable steps, tag/link applications, resolve a case, publish and submit useful/not-useful feedback with an optional difference note.
6. **Internal search MVP:** implement safe FTS query compilation, snippets, tier ranking, filters and source labels. Prove exact errors outrank published articles, which outrank resolved cases, and exclude inappropriate draft/open content from reader search.
7. **Provider framework:** implement registry, `allSettled` concurrency, timeout, partial-failure metadata and MSW contract tests with a fake provider.
8. **Jira adapter:** add non-secret source configuration and environment secret lookup, escaped allow-listed JQL, lightweight search, lazy detail/comment retrieval, safe ADF conversion and sanitised errors.
9. **Promotion flow:** promote a selected Jira result to a draft with immutable captured provenance; verify it is never auto-published or subsequently synchronised.
10. **Release gate:** Playwright covers search, provider partial failure, draft/publish, feedback and promotion. Run type-check, lint, unit, integration, component and end-to-end suites; document backup/restore, environment variables and single-instance deployment constraints.

Phase 1 is complete only when an authenticated reader can search internal and Jira sources with clear source labels despite one provider failing, and an editor can promote an external result into a reviewed, provenance-linked published article without any secret or unsafe rich content entering the database/UI.
