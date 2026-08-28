PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  external_subject TEXT UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE knowledge_articles (
  id TEXT PRIMARY KEY NOT NULL,
  stable_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  problem TEXT NOT NULL DEFAULT '',
  symptoms TEXT NOT NULL DEFAULT '',
  resolution_summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'deprecated', 'archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  last_used_at TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status = 'published' AND published_by_user_id IS NOT NULL AND published_at IS NOT NULL)
    OR (status <> 'published' AND published_by_user_id IS NULL AND published_at IS NULL))
);

CREATE TABLE knowledge_steps (
  id TEXT PRIMARY KEY NOT NULL,
  article_id TEXT NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  stable_key TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  step_type TEXT NOT NULL CHECK (step_type IN ('instruction', 'check', 'decision', 'sql', 'powershell', 'code', 'url', 'warning', 'expected_result')),
  title TEXT,
  instruction TEXT NOT NULL,
  code TEXT,
  notes TEXT,
  body_ast_json TEXT NOT NULL,
  body_plain_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (article_id, stable_key),
  UNIQUE (article_id, position)
);

CREATE TABLE step_edges (
  id TEXT PRIMARY KEY NOT NULL,
  article_id TEXT NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  from_step_id TEXT NOT NULL REFERENCES knowledge_steps(id) ON DELETE CASCADE,
  to_step_id TEXT NOT NULL REFERENCES knowledge_steps(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL CHECK (edge_type IN ('next', 'branch', 'related')),
  label TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (from_step_id, to_step_id, edge_type),
  CHECK (from_step_id <> to_step_id)
);

CREATE TABLE applications (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE article_applications (
  article_id TEXT NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (article_id, application_id)
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE article_tags (
  article_id TEXT NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (article_id, tag_id)
);

CREATE TABLE support_cases (
  id TEXT PRIMARY KEY NOT NULL,
  stable_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  resolution_notes TEXT NOT NULL DEFAULT '',
  article_id TEXT REFERENCES knowledge_articles(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'closed')),
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  resolved_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status = 'open' AND resolved_by_user_id IS NULL AND resolved_at IS NULL)
    OR (status IN ('resolved', 'closed') AND resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL))
);

CREATE TABLE external_sources (
  id TEXT PRIMARY KEY NOT NULL,
  provider_type TEXT NOT NULL,
  name TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  base_url TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  secret_env_ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE knowledge_source_links (
  id TEXT PRIMARY KEY NOT NULL,
  article_id TEXT NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('support_case', 'external_item', 'manual')),
  support_case_id TEXT REFERENCES support_cases(id) ON DELETE RESTRICT,
  external_source_id TEXT REFERENCES external_sources(id) ON DELETE RESTRICT,
  external_item_key TEXT,
  external_url TEXT,
  source_title TEXT,
  captured_at TEXT NOT NULL,
  snapshot_text TEXT,
  created_at TEXT NOT NULL,
  CHECK (
    (source_kind = 'support_case' AND support_case_id IS NOT NULL AND external_source_id IS NULL AND external_item_key IS NULL AND external_url IS NULL AND source_title IS NULL)
    OR (source_kind = 'external_item' AND support_case_id IS NULL AND external_source_id IS NOT NULL AND external_item_key IS NOT NULL AND external_url IS NOT NULL)
    OR (source_kind = 'manual' AND support_case_id IS NULL AND external_source_id IS NULL AND external_item_key IS NULL AND (external_url IS NOT NULL OR source_title IS NOT NULL))
  )
);

CREATE TABLE article_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  article_id TEXT NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  submitted_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  outcome TEXT NOT NULL CHECK (outcome IN ('yes', 'no')),
  difference_note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE search_documents (
  id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('article', 'support_case')),
  entity_id TEXT NOT NULL,
  source_label TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  exact_terms TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX knowledge_articles_status_updated_at_idx ON knowledge_articles(status, updated_at);
CREATE INDEX knowledge_steps_article_position_idx ON knowledge_steps(article_id, position);
CREATE INDEX step_edges_article_from_idx ON step_edges(article_id, from_step_id);
CREATE INDEX step_edges_article_to_idx ON step_edges(article_id, to_step_id);
CREATE INDEX support_cases_status_updated_at_idx ON support_cases(status, updated_at);
CREATE INDEX knowledge_source_links_article_idx ON knowledge_source_links(article_id);
CREATE INDEX knowledge_source_links_external_item_idx ON knowledge_source_links(external_source_id, external_item_key);
CREATE INDEX article_feedback_article_created_at_idx ON article_feedback(article_id, created_at);
CREATE INDEX search_documents_entity_idx ON search_documents(entity_type, entity_id);
CREATE INDEX search_documents_status_updated_at_idx ON search_documents(status, updated_at);
CREATE INDEX external_sources_enabled_provider_idx ON external_sources(enabled, provider_type);
