import type BetterSqlite3 from "better-sqlite3";

export const SAMPLE_IDS = {
  user: "00000000-0000-4000-8000-000000000001",
  application: "00000000-0000-4000-8000-000000000002",
  tag: "00000000-0000-4000-8000-000000000003",
  article: "00000000-0000-4000-8000-000000000004",
  step: "00000000-0000-4000-8000-000000000005",
  searchDocument: "00000000-0000-4000-8000-000000000006",
  sourceLink: "00000000-0000-4000-8000-000000000007",
} as const;

const SAMPLE_TIME = "2026-08-28T09:15:00.000Z";
const SAMPLE_AST = JSON.stringify({
  version: 1,
  type: "document",
  children: [{ type: "paragraph", text: "Replace the damaged USB cable." }],
});

function assertNaturalKeyAvailable(
  database: BetterSqlite3.Database,
  table: string,
  column: string,
  value: string,
  expectedId: string,
): void {
  const row = database
    .prepare(`SELECT id FROM ${table} WHERE ${column} = ? AND id <> ?`)
    .get(value, expectedId);
  if (row !== undefined)
    throw new Error(
      `Seed conflict in ${table}: ${column} ${value} belongs to another record`,
    );
}

export function seedSampleData(database: BetterSqlite3.Database): void {
  database.transaction(() => {
    assertNaturalKeyAvailable(
      database,
      "users",
      "external_subject",
      "local-development-user",
      SAMPLE_IDS.user,
    );
    assertNaturalKeyAvailable(
      database,
      "users",
      "email",
      "local@dejaview.invalid",
      SAMPLE_IDS.user,
    );
    assertNaturalKeyAvailable(
      database,
      "applications",
      "key",
      "print-service",
      SAMPLE_IDS.application,
    );
    assertNaturalKeyAvailable(
      database,
      "tags",
      "slug",
      "printer",
      SAMPLE_IDS.tag,
    );
    assertNaturalKeyAvailable(
      database,
      "tags",
      "name",
      "Printer",
      SAMPLE_IDS.tag,
    );
    assertNaturalKeyAvailable(
      database,
      "knowledge_articles",
      "stable_key",
      "KB-EXAMPLE-001",
      SAMPLE_IDS.article,
    );

    database
      .prepare(
        `INSERT INTO users
        (id, external_subject, display_name, email, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          external_subject = excluded.external_subject,
          display_name = excluded.display_name,
          email = excluded.email,
          status = excluded.status,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at`,
      )
      .run(
        SAMPLE_IDS.user,
        "local-development-user",
        "Local DejaView User",
        "local@dejaview.invalid",
        SAMPLE_TIME,
        SAMPLE_TIME,
      );
    database
      .prepare(
        `INSERT INTO applications
        (id, key, name, description, created_at, updated_at)
        VALUES (?, 'print-service', 'Print Service', 'Example application', ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          key = excluded.key,
          name = excluded.name,
          description = excluded.description,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at`,
      )
      .run(SAMPLE_IDS.application, SAMPLE_TIME, SAMPLE_TIME);
    database
      .prepare(
        `INSERT INTO tags
        (id, slug, name, created_at, updated_at)
        VALUES (?, 'printer', 'Printer', ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          slug = excluded.slug,
          name = excluded.name,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at`,
      )
      .run(SAMPLE_IDS.tag, SAMPLE_TIME, SAMPLE_TIME);
    database
      .prepare(
        `INSERT INTO knowledge_articles
        (id, stable_key, title, summary, problem, symptoms, resolution_summary, status, version, use_count,
         last_used_at, created_by_user_id, updated_by_user_id, published_by_user_id, published_at, created_at, updated_at)
        VALUES (?, 'KB-EXAMPLE-001', 'Resolve printer error E42', 'Restore printing after a connection failure',
          'A desktop printer cannot start a job', 'Error E42 appears on the display', 'Replace the damaged USB cable',
          'published', 1, 2, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          stable_key = excluded.stable_key,
          title = excluded.title,
          summary = excluded.summary,
          problem = excluded.problem,
          symptoms = excluded.symptoms,
          resolution_summary = excluded.resolution_summary,
          status = excluded.status,
          version = excluded.version,
          use_count = excluded.use_count,
          last_used_at = excluded.last_used_at,
          created_by_user_id = excluded.created_by_user_id,
          updated_by_user_id = excluded.updated_by_user_id,
          published_by_user_id = excluded.published_by_user_id,
          published_at = excluded.published_at,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at`,
      )
      .run(
        SAMPLE_IDS.article,
        SAMPLE_TIME,
        SAMPLE_IDS.user,
        SAMPLE_IDS.user,
        SAMPLE_IDS.user,
        SAMPLE_TIME,
        SAMPLE_TIME,
        SAMPLE_TIME,
      );
    database
      .prepare(
        `INSERT INTO knowledge_steps
        (id, article_id, stable_key, position, step_type, title, instruction, code, notes,
         body_ast_json, body_plain_text, created_at, updated_at)
        VALUES (?, ?, 'replace-cable', 0, 'instruction', 'Replace the cable',
          'Replace the damaged USB cable.', NULL, NULL, ?, 'Replace the damaged USB cable.', ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          article_id = excluded.article_id,
          stable_key = excluded.stable_key,
          position = excluded.position,
          step_type = excluded.step_type,
          title = excluded.title,
          instruction = excluded.instruction,
          code = excluded.code,
          notes = excluded.notes,
          body_ast_json = excluded.body_ast_json,
          body_plain_text = excluded.body_plain_text,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at`,
      )
      .run(
        SAMPLE_IDS.step,
        SAMPLE_IDS.article,
        SAMPLE_AST,
        SAMPLE_TIME,
        SAMPLE_TIME,
      );
    database
      .prepare(
        `INSERT INTO article_applications (article_id, application_id, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(article_id, application_id) DO UPDATE SET created_at = excluded.created_at`,
      )
      .run(SAMPLE_IDS.article, SAMPLE_IDS.application, SAMPLE_TIME);
    database
      .prepare(
        `INSERT INTO article_tags (article_id, tag_id, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(article_id, tag_id) DO UPDATE SET created_at = excluded.created_at`,
      )
      .run(SAMPLE_IDS.article, SAMPLE_IDS.tag, SAMPLE_TIME);
    database
      .prepare(
        `INSERT INTO knowledge_source_links
        (id, article_id, source_kind, source_title, captured_at, created_at)
        VALUES (?, ?, 'internal', 'Created in DejaView', ?, ?)
        ON CONFLICT(id) DO UPDATE SET source_title = excluded.source_title`,
      )
      .run(SAMPLE_IDS.sourceLink, SAMPLE_IDS.article, SAMPLE_TIME, SAMPLE_TIME);
    database
      .prepare(
        `INSERT INTO search_documents
        (id, entity_type, entity_id, source_label, title, body, exact_terms, status, updated_at)
        VALUES (?, 'article', ?, 'DejaView knowledge', 'Resolve printer error E42',
          'A desktop printer cannot start a job. Error E42 appears on the display. Replace the damaged USB cable.',
          'E42', 'published', ?)
        ON CONFLICT(entity_type, entity_id) DO UPDATE SET
          id = excluded.id,
          source_label = excluded.source_label,
          title = excluded.title,
          body = excluded.body,
          exact_terms = excluded.exact_terms,
          status = excluded.status,
          updated_at = excluded.updated_at`,
      )
      .run(SAMPLE_IDS.searchDocument, SAMPLE_IDS.article, SAMPLE_TIME);
  })();
}
