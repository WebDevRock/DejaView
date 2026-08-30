-- Replace the support-case product model with knowledge-only provenance.
-- The migration runner wraps this script in a transaction with foreign keys enabled.

DROP TRIGGER IF EXISTS search_documents_fts_insert;
DROP TRIGGER IF EXISTS search_documents_fts_delete;
DROP TRIGGER IF EXISTS search_documents_fts_update;
DROP TABLE search_documents_fts;
DROP TABLE search_documents;

ALTER TABLE knowledge_source_links RENAME TO knowledge_source_links_legacy;

CREATE TABLE knowledge_source_links (
  id TEXT PRIMARY KEY NOT NULL,
  article_id TEXT NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('internal', 'external', 'manual')),
  external_source_id TEXT REFERENCES external_sources(id) ON DELETE RESTRICT,
  external_item_key TEXT,
  external_url TEXT,
  source_title TEXT,
  captured_at TEXT NOT NULL,
  snapshot_text TEXT,
  created_at TEXT NOT NULL,
  CHECK (
    (source_kind = 'internal' AND external_source_id IS NULL AND external_item_key IS NULL AND external_url IS NULL)
    OR (source_kind = 'external' AND source_title IS NOT NULL AND
      ((external_source_id IS NULL)
       OR (external_source_id IS NOT NULL AND external_item_key IS NOT NULL AND external_url IS NOT NULL)))
    OR (source_kind = 'manual' AND external_source_id IS NULL AND external_item_key IS NULL AND (external_url IS NOT NULL OR source_title IS NOT NULL))
  )
);

INSERT INTO knowledge_source_links
  (id, article_id, source_kind, external_source_id, external_item_key, external_url,
   source_title, captured_at, snapshot_text, created_at)
SELECT id, article_id,
  CASE source_kind WHEN 'external_item' THEN 'external' ELSE source_kind END,
  external_source_id, external_item_key, external_url,
  CASE WHEN source_kind='external_item' THEN COALESCE(
    source_title,
    (SELECT name FROM external_sources WHERE id=knowledge_source_links_legacy.external_source_id),
    external_item_key,
    'External source'
  ) ELSE source_title END,
  captured_at, snapshot_text, created_at
FROM knowledge_source_links_legacy
WHERE source_kind <> 'support_case';

-- A pre-existing support-case link is the authoritative relationship. Preserve
-- its identity and timestamps while converting it to providerless provenance.
INSERT INTO knowledge_source_links
  (id, article_id, source_kind, external_source_id, external_item_key, external_url,
   source_title, captured_at, snapshot_text, created_at)
SELECT l.id, l.article_id, 'external', NULL, c.stable_key, NULL,
  'Legacy support case ' || c.stable_key || ' — ' || c.title,
  l.captured_at,
  CASE
    WHEN instr(coalesce(l.snapshot_text, ''), 'Occurred at: ' || c.occurred_at) > 0 THEN l.snapshot_text
    WHEN coalesce(l.snapshot_text, '') <> '' THEN l.snapshot_text || char(10) || 'Occurred at: ' || c.occurred_at
    ELSE trim(c.description || char(10) || c.what_was_tried || char(10) || c.resolution_notes) ||
      CASE WHEN trim(c.description || c.what_was_tried || c.resolution_notes) <> '' THEN char(10) ELSE '' END ||
      'Occurred at: ' || c.occurred_at
  END,
  l.created_at
FROM knowledge_source_links_legacy l
JOIN support_cases c ON c.id=l.support_case_id
WHERE l.source_kind='support_case';

-- Reconstruct provenance from support_cases.article_id only when no explicit
-- source link exists for that case.
INSERT INTO knowledge_source_links
  (id, article_id, source_kind, external_source_id, external_item_key, external_url,
   source_title, captured_at, snapshot_text, created_at)
SELECT 'legacy-case-source:' || c.id, c.article_id, 'external', NULL, c.stable_key, NULL,
  'Legacy support case ' || c.stable_key || ' — ' || c.title,
  c.updated_at,
  trim(c.description || char(10) || c.what_was_tried || char(10) || c.resolution_notes) ||
    CASE WHEN trim(c.description || c.what_was_tried || c.resolution_notes) <> '' THEN char(10) ELSE '' END ||
    'Occurred at: ' || c.occurred_at,
  c.updated_at
FROM support_cases c
WHERE c.article_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM knowledge_source_links_legacy l
    WHERE l.source_kind='support_case' AND l.support_case_id=c.id
  );

INSERT INTO knowledge_articles
  (id, stable_key, title, summary, problem, symptoms, resolution_summary, status, version,
   use_count, last_used_at, created_by_user_id, updated_by_user_id, published_by_user_id,
   published_at, created_at, updated_at)
SELECT 'legacy-case:' || id, 'KB-LEGACY-' || stable_key, title, '', description,
  what_was_tried, resolution_notes,
  CASE WHEN status IN ('resolved', 'closed') THEN 'published' ELSE 'draft' END,
  1, 0, NULL, created_by_user_id, COALESCE(resolved_by_user_id, created_by_user_id),
  CASE WHEN status IN ('resolved', 'closed') THEN COALESCE(resolved_by_user_id, created_by_user_id) ELSE NULL END,
  CASE WHEN status IN ('resolved', 'closed') THEN COALESCE(resolved_at, updated_at) ELSE NULL END,
  created_at, updated_at
FROM support_cases
WHERE article_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM knowledge_source_links_legacy l
    WHERE l.source_kind='support_case' AND l.support_case_id=support_cases.id
  );

INSERT INTO knowledge_steps
  (id, article_id, stable_key, position, step_type, title, instruction, code, notes,
   body_ast_json, body_plain_text, created_at, updated_at)
SELECT 'legacy-case-step:' || id, 'legacy-case:' || id, 'legacy-case-resolution', 0,
  'instruction', 'Resolution',
  CASE WHEN trim(resolution_notes) <> '' THEN resolution_notes ELSE 'Resolution not yet documented.' END,
  NULL, NULL,
  json_object('version', 1, 'type', 'document', 'children', json_array(json_object('type', 'paragraph', 'text', CASE WHEN trim(resolution_notes) <> '' THEN resolution_notes ELSE 'Resolution not yet documented.' END))),
  CASE WHEN trim(resolution_notes) <> '' THEN resolution_notes ELSE 'Resolution not yet documented.' END,
  created_at, updated_at
FROM support_cases
WHERE article_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM knowledge_source_links_legacy l
    WHERE l.source_kind='support_case' AND l.support_case_id=support_cases.id
  );

INSERT INTO knowledge_source_links
  (id, article_id, source_kind, external_source_id, external_item_key, external_url,
   source_title, captured_at, snapshot_text, created_at)
SELECT 'legacy-case-source:' || id, 'legacy-case:' || id, 'external', NULL, stable_key, NULL,
  'Legacy support case ' || stable_key || ' — ' || title,
  updated_at,
  trim(description || char(10) || what_was_tried || char(10) || resolution_notes) ||
    CASE WHEN trim(description || what_was_tried || resolution_notes) <> '' THEN char(10) ELSE '' END ||
    'Occurred at: ' || occurred_at,
  updated_at
FROM support_cases
WHERE article_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM knowledge_source_links_legacy l
    WHERE l.source_kind='support_case' AND l.support_case_id=support_cases.id
  );

-- Existing locally-authored articles remain visibly internal even when a linked
-- legacy case is retained as an additional migration record. Imported articles
-- already have a real external provider and do not receive a false internal source.
INSERT INTO knowledge_source_links
  (id, article_id, source_kind, source_title, captured_at, snapshot_text, created_at)
SELECT 'internal-source:' || a.id, a.id, 'internal', 'Created in DejaView',
  a.created_at, NULL, a.created_at
FROM knowledge_articles a
WHERE a.id NOT LIKE 'legacy-case:%'
  AND NOT EXISTS (
    SELECT 1 FROM knowledge_source_links l
    WHERE l.article_id=a.id
      AND (l.source_kind IN ('internal', 'manual') OR l.external_source_id IS NOT NULL)
  );

DROP TABLE knowledge_source_links_legacy;
DROP TABLE support_cases;

CREATE INDEX knowledge_source_links_article_idx ON knowledge_source_links(article_id);
CREATE INDEX knowledge_source_links_external_item_idx ON knowledge_source_links(external_source_id, external_item_key);
CREATE UNIQUE INDEX knowledge_source_links_external_item_unique
  ON knowledge_source_links(external_source_id, external_item_key)
  WHERE external_source_id IS NOT NULL AND external_item_key IS NOT NULL;

CREATE TABLE search_documents (
  id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type = 'article'),
  entity_id TEXT NOT NULL,
  source_label TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  exact_terms TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (entity_type, entity_id)
);
CREATE INDEX search_documents_entity_idx ON search_documents(entity_type, entity_id);
CREATE INDEX search_documents_status_updated_at_idx ON search_documents(status, updated_at);

INSERT INTO search_documents
  (id, entity_type, entity_id, source_label, title, body, exact_terms, status, updated_at)
SELECT 'article:' || a.id, 'article', a.id,
  COALESCE(
    (SELECT CASE WHEN e.provider_type='jira' THEN 'Jira' ELSE e.name END
     FROM knowledge_source_links l JOIN external_sources e ON e.id=l.external_source_id
     WHERE l.article_id=a.id AND l.source_kind='external' ORDER BY l.created_at, l.id LIMIT 1),
    (SELECT CASE
       WHEN l.source_kind='internal' THEN 'DejaView knowledge'
       WHEN l.source_kind='external' THEN 'Legacy source'
       WHEN l.source_kind='manual' THEN COALESCE(l.source_title, 'Manual source')
       ELSE 'DejaView knowledge'
     END
     FROM knowledge_source_links l WHERE l.article_id=a.id
     ORDER BY CASE
       WHEN l.source_kind='internal' THEN 1
       WHEN l.source_kind='external' THEN 2
       WHEN l.source_kind='manual' THEN 3
       ELSE 4
     END, l.created_at, l.id LIMIT 1),
    'DejaView knowledge'),
  a.title,
  trim(coalesce(nullif(a.summary,'') || char(10),'') ||
       coalesce(nullif(a.problem,'') || char(10),'') ||
       coalesce(nullif(a.symptoms,'') || char(10),'') ||
       coalesce(nullif(a.resolution_summary,'') || char(10),'') ||
       coalesce((SELECT group_concat(trim(coalesce(nullif(s.title,'') || char(10),'') || coalesce(nullif(s.instruction,'') || char(10),'') || coalesce(nullif(s.body_plain_text,'') || char(10),'') || coalesce(nullif(s.code,'') || char(10),'') || coalesce(nullif(s.notes,'') || char(10),'')), char(10)) FROM knowledge_steps s WHERE s.article_id=a.id),'') || char(10) ||
       coalesce((SELECT group_concat(ap.name || char(10) || ap.key, char(10)) FROM article_applications aa JOIN applications ap ON ap.id=aa.application_id WHERE aa.article_id=a.id),'') || char(10) ||
       coalesce((SELECT group_concat(t.name || char(10) || t.slug, char(10)) FROM article_tags at JOIN tags t ON t.id=at.tag_id WHERE at.article_id=a.id),''), char(10)),
  trim(coalesce(nullif(a.symptoms,'') || char(10),'') || coalesce((SELECT group_concat(nullif(s.code,''),char(10)) FROM knowledge_steps s WHERE s.article_id=a.id),''), char(10)),
  a.status, a.updated_at
FROM knowledge_articles a;

CREATE VIRTUAL TABLE search_documents_fts USING fts5(
  title, body, exact_terms, content = 'search_documents', content_rowid = 'rowid'
);
CREATE TRIGGER search_documents_fts_insert AFTER INSERT ON search_documents BEGIN
  INSERT INTO search_documents_fts(rowid, title, body, exact_terms)
  VALUES (new.rowid, new.title, new.body, new.exact_terms);
END;
CREATE TRIGGER search_documents_fts_delete AFTER DELETE ON search_documents BEGIN
  INSERT INTO search_documents_fts(search_documents_fts, rowid, title, body, exact_terms)
  VALUES ('delete', old.rowid, old.title, old.body, old.exact_terms);
END;
CREATE TRIGGER search_documents_fts_update AFTER UPDATE ON search_documents BEGIN
  INSERT INTO search_documents_fts(search_documents_fts, rowid, title, body, exact_terms)
  VALUES ('delete', old.rowid, old.title, old.body, old.exact_terms);
  INSERT INTO search_documents_fts(rowid, title, body, exact_terms)
  VALUES (new.rowid, new.title, new.body, new.exact_terms);
END;
INSERT INTO search_documents_fts(search_documents_fts) VALUES ('rebuild');
