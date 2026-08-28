import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  externalSubject: text("external_subject").unique(),
  displayName: text("display_name").notNull(),
  email: text("email").unique(),
  status: text("status", { enum: ["active", "disabled"] }).notNull(),
  ...timestamps,
});

export const knowledgeArticles = sqliteTable(
  "knowledge_articles",
  {
    id: text("id").primaryKey(),
    stableKey: text("stable_key").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    problem: text("problem").notNull().default(""),
    symptoms: text("symptoms").notNull().default(""),
    resolutionSummary: text("resolution_summary").notNull().default(""),
    status: text("status", {
      enum: ["draft", "published", "deprecated", "archived"],
    })
      .notNull()
      .default("draft"),
    version: integer("version").notNull().default(1),
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: text("last_used_at"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    publishedByUserId: text("published_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    publishedAt: text("published_at"),
    ...timestamps,
  },
  (table) => [
    index("knowledge_articles_status_updated_at_idx").on(
      table.status,
      table.updatedAt,
    ),
  ],
);

export const knowledgeSteps = sqliteTable(
  "knowledge_steps",
  {
    id: text("id").primaryKey(),
    articleId: text("article_id")
      .notNull()
      .references(() => knowledgeArticles.id, { onDelete: "cascade" }),
    stableKey: text("stable_key").notNull(),
    position: integer("position").notNull(),
    stepType: text("step_type", {
      enum: [
        "instruction",
        "check",
        "decision",
        "sql",
        "powershell",
        "code",
        "url",
        "warning",
        "expected_result",
      ],
    }).notNull(),
    title: text("title"),
    instruction: text("instruction").notNull(),
    code: text("code"),
    notes: text("notes"),
    bodyAstJson: text("body_ast_json").notNull(),
    bodyPlainText: text("body_plain_text").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("knowledge_steps_article_stable_key_unique").on(
      table.articleId,
      table.stableKey,
    ),
    unique("knowledge_steps_article_position_unique").on(
      table.articleId,
      table.position,
    ),
    index("knowledge_steps_article_position_idx").on(
      table.articleId,
      table.position,
    ),
  ],
);

export const stepEdges = sqliteTable(
  "step_edges",
  {
    id: text("id").primaryKey(),
    articleId: text("article_id")
      .notNull()
      .references(() => knowledgeArticles.id, { onDelete: "cascade" }),
    fromStepId: text("from_step_id")
      .notNull()
      .references(() => knowledgeSteps.id, { onDelete: "cascade" }),
    toStepId: text("to_step_id")
      .notNull()
      .references(() => knowledgeSteps.id, { onDelete: "cascade" }),
    edgeType: text("edge_type", {
      enum: ["next", "branch", "related"],
    }).notNull(),
    label: text("label"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    unique("step_edges_steps_type_unique").on(
      table.fromStepId,
      table.toStepId,
      table.edgeType,
    ),
    index("step_edges_article_from_idx").on(table.articleId, table.fromStepId),
    index("step_edges_article_to_idx").on(table.articleId, table.toStepId),
  ],
);

export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  ...timestamps,
});

export const articleApplications = sqliteTable(
  "article_applications",
  {
    articleId: text("article_id")
      .notNull()
      .references(() => knowledgeArticles.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.articleId, table.applicationId] })],
);

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull().unique(),
  ...timestamps,
});

export const articleTags = sqliteTable(
  "article_tags",
  {
    articleId: text("article_id")
      .notNull()
      .references(() => knowledgeArticles.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.articleId, table.tagId] })],
);

export const supportCases = sqliteTable(
  "support_cases",
  {
    id: text("id").primaryKey(),
    stableKey: text("stable_key").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    occurredAt: text("occurred_at").notNull(),
    resolutionNotes: text("resolution_notes").notNull().default(""),
    articleId: text("article_id").references(() => knowledgeArticles.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: ["open", "resolved", "closed"] }).notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    resolvedByUserId: text("resolved_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    resolvedAt: text("resolved_at"),
    ...timestamps,
  },
  (table) => [
    index("support_cases_status_updated_at_idx").on(
      table.status,
      table.updatedAt,
    ),
  ],
);

export const externalSources = sqliteTable(
  "external_sources",
  {
    id: text("id").primaryKey(),
    providerType: text("provider_type").notNull(),
    name: text("name").notNull().unique(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    baseUrl: text("base_url").notNull(),
    configJson: text("config_json").notNull().default("{}"),
    secretEnvRef: text("secret_env_ref").notNull(),
    ...timestamps,
  },
  (table) => [
    index("external_sources_enabled_provider_idx").on(
      table.enabled,
      table.providerType,
    ),
  ],
);

export const knowledgeSourceLinks = sqliteTable(
  "knowledge_source_links",
  {
    id: text("id").primaryKey(),
    articleId: text("article_id")
      .notNull()
      .references(() => knowledgeArticles.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind", {
      enum: ["support_case", "external_item", "manual"],
    }).notNull(),
    supportCaseId: text("support_case_id").references(() => supportCases.id, {
      onDelete: "restrict",
    }),
    externalSourceId: text("external_source_id").references(
      () => externalSources.id,
      { onDelete: "restrict" },
    ),
    externalItemKey: text("external_item_key"),
    externalUrl: text("external_url"),
    sourceTitle: text("source_title"),
    capturedAt: text("captured_at").notNull(),
    snapshotText: text("snapshot_text"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("knowledge_source_links_article_idx").on(table.articleId),
    index("knowledge_source_links_external_item_idx").on(
      table.externalSourceId,
      table.externalItemKey,
    ),
  ],
);

export const articleFeedback = sqliteTable(
  "article_feedback",
  {
    id: text("id").primaryKey(),
    articleId: text("article_id")
      .notNull()
      .references(() => knowledgeArticles.id, { onDelete: "cascade" }),
    submittedByUserId: text("submitted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    outcome: text("outcome", { enum: ["yes", "no"] }).notNull(),
    differenceNote: text("difference_note"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("article_feedback_article_created_at_idx").on(
      table.articleId,
      table.createdAt,
    ),
  ],
);

export const searchDocuments = sqliteTable(
  "search_documents",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type", {
      enum: ["article", "support_case"],
    }).notNull(),
    entityId: text("entity_id").notNull(),
    sourceLabel: text("source_label").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    exactTerms: text("exact_terms").notNull().default(""),
    status: text("status").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("search_documents_entity_unique").on(
      table.entityType,
      table.entityId,
    ),
    index("search_documents_entity_idx").on(table.entityType, table.entityId),
    index("search_documents_status_updated_at_idx").on(
      table.status,
      table.updatedAt,
    ),
  ],
);

export const schemaMigrations = sqliteTable("schema_migrations", {
  filename: text("filename").primaryKey(),
  checksum: text("checksum").notNull(),
  appliedAt: text("applied_at").notNull(),
});
