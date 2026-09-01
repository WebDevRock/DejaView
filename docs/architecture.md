# DejaView architecture

Status: implemented knowledge-only Phase 1 architecture. User-facing language uses British English.

## Runtime shape and boundaries

DejaView is a modular monolith: one Next.js 16 application, one Node.js process and one SQLite database. The App Router and versioned `/api/v1` handlers invoke application services; infrastructure adapters implement domain ports for SQLite/Drizzle, FTS5 and external providers.

```text
app and infrastructure -> application -> domain
```

- `domain` has no Next.js, SQLite or infrastructure imports.
- `application` orchestrates use cases through domain ports and has no framework/database imports.
- `infrastructure` owns SQLite, FTS5 and provider adapters.
- `app` owns transport, validation, actor resolution, composition and UI.
- Route handlers are thin and mutations use explicit transactions.
- The Node.js runtime is required because `better-sqlite3` is native and process-local.
- One writable process may use a SQLite file. WAL, foreign keys and a busy timeout are enabled.

`npm run boundary:check` enforces the dependency direction.

## Knowledge model

Everything stored locally for users to read is a knowledge article. The runtime model contains only knowledge articles and external provider results.

- `knowledge_articles` stores stable identity, authoring fields, lifecycle (`draft`, `published`, `deprecated`, `archived`), optimistic version, use count and actor/timestamp metadata.
- `knowledge_steps` stores ordered, stable steps and safe AST/plain-text projections.
- `step_edges` stores typed relationships between steps in the same article.
- `applications`, `tags` and their article join tables provide reusable classification.
- `article_feedback` stores useful/not-useful outcomes and optional difference notes.
- Owned rows cascade from articles; actor and external-source references restrict deletion.

Quick capture creates a Draft article, one instruction step and an internal provenance record. Publication remains an explicit lifecycle operation.

## Provider-neutral provenance

`knowledge_source_links` is article-only and uses `source_kind IN ('internal','external','manual')`:

- **internal** means authored in DejaView and displays `Created in DejaView`;
- **external** can reference an `external_sources` provider plus exact external key and URL, or represent preserved migration-era legacy provenance without a live provider;
- **manual** records a user-supplied title and/or URL.

The source record stores capture time and may store an internal sanitised `snapshot_text`. Snapshots are not returned in article DTOs or rendered by provenance UI. External article DTOs expose provider-neutral fields: canonical type/label, configured provider label, external key, exact safe backlink, title and capture time.

Jira keeps canonical source ID/type `jira`. Live results use the configured `JIRA_SOURCE_LABEL`; imported articles visibly identify canonical **Jira** and additionally show the configured label, issue key and exact canonical backlink. No Jira-specific column exists in the core provenance table.

Every newly authored article receives internal provenance. External promotion transactionally removes that temporary internal marker, inserts the external provenance record and refreshes the article search source label immediately.

## Migration 0006

Migrations `0001`–`0005` are immutable historical schema. `0006_knowledge_only_provenance.sql` performs the compatibility upgrade in one checksum-recorded transaction with foreign keys enabled:

1. drops the old mixed search projection and FTS triggers/table;
2. rebuilds `knowledge_source_links` with final source-kind constraints while preserving external/manual rows;
3. collapses linked historical records into their existing article and retains an additional legacy provenance snapshot;
4. converts every unlinked historical record into an article and resolution step; resolved/closed records become Published and open records become Draft;
5. adds internal provenance to locally authored existing articles unless real external/manual provenance already identifies them;
6. drops the historical table only after dependent legacy provenance has been rebuilt;
7. creates article-only `search_documents`, FTS5 triggers and a complete rebuilt FTS index.

Migration tests exercise linked and unlinked records, lifecycle mapping, content/steps, external/manual preservation, article-only search, `foreign_key_check` and FTS synchronisation.

## Search

Local search contains only article projection rows:

```text
search_documents(
  id, entity_type CHECK(entity_type='article'), entity_id,
  source_label, title, body, exact_terms, status, updated_at,
  UNIQUE(entity_type, entity_id)
)
```

`search_documents_fts` is an external-content FTS5 table indexing title, body and exact terms. Insert/update/delete triggers keep it synchronised. Projection writes happen in the same transaction as canonical article writes; `npm run search:reindex` repairs all article projections and rebuilds FTS.

The repository safely compiles user text, excludes non-published local articles, ranks exact boundaries first and paginates with signed keyset cursors. Filters include source/provider, application, tag and date. Search results link only to `/knowledge/:id`. Provider calls run concurrently through the registry; failures produce sanitised partial-result warnings rather than hiding successful local/provider results.

`source=knowledge` selects articles without a live external provider. `source=external` selects externally sourced articles and external provider results. A provider type such as `source=jira` selects imported articles of that canonical type and the live provider.

## Jira adapter and promotion

The Jira adapter validates an `*.atlassian.net` HTTPS origin and allow-listed project/issue keys, builds escaped JQL from typed filters, rejects redirects, bounds request time/size, sanitises errors and converts ADF to an allow-listed AST. Detail and comments load lazily; comments are never included in promotion snapshots.

Promotion refetches the issue, creates one local Draft article, records exact source provenance and returns the existing article on duplicate `(external_source_id, external_item_key)`. It is a snapshot, not synchronisation: Jira remains authoritative for live data, but later Jira edits do not silently modify the imported article. DejaView does not edit Jira.

## HTTP surface

```text
GET    /api/v1/health
GET    /api/v1/search
GET    /api/v1/articles
POST   /api/v1/articles/quick
GET    /api/v1/articles/:id
PATCH  /api/v1/articles/:id
POST   /api/v1/articles/:id/publish
GET    /api/v1/articles/:id/feedback
POST   /api/v1/articles/:id/feedback
GET    /api/v1/articles/:id/related
GET    /api/v1/providers/jira/search
GET    /api/v1/providers/jira/issues/:key
POST   /api/v1/providers/jira/issues/:key/promote
```

There are no case routes. Successful API responses use `{ data, meta }`; errors use the versioned error envelope. Zod validates transport/provider inputs. Mutations require an actor, role checks where appropriate and same-origin browser evidence.

## Security and persistence

- Provider credentials remain server-side and only environment-variable names are stored.
- SQL uses parameters; FTS and JQL have dedicated escaping.
- External rich text is untrusted and rendered only through safe AST/plain text.
- Search cursors are HMAC-signed; production requires `DEJAVIEW_CURSOR_SECRET`.
- Promoted content starts as Draft for human review.
- Back up a consistent SQLite database/WAL/SHM set or use SQLite online backup. Applied migrations are immutable and recorded with SHA-256 checksums.
- PostgreSQL remains an adapter seam, not an implemented feature.

## Explicit non-goals

No AI-generated answers, semantic/vector search, background Jira synchronisation, Jira editing, automatic publication, microservices, multi-writer SQLite, multi-tenancy, attachments/OCR, arbitrary web ingestion or real-time collaborative editing are included.
