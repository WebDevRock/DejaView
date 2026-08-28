import type BetterSqlite3 from "better-sqlite3";

/** CLI-safe projection repair primitive; callers own connection lifecycle. */
export function repairSearchProjection(database: BetterSqlite3.Database): {
  documents: number;
} {
  return database.transaction(() => {
    database.exec("DELETE FROM search_documents");
    database.exec(`INSERT INTO search_documents(id,entity_type,entity_id,source_label,title,body,exact_terms,status,updated_at)
      SELECT 'article:'||a.id,'article',a.id,'Knowledge',a.title,
        trim(
          coalesce(nullif(a.summary,'')||char(10),'')||
          coalesce(nullif(a.problem,'')||char(10),'')||
          coalesce(nullif(a.symptoms,'')||char(10),'')||
          coalesce(nullif(a.resolution_summary,'')||char(10),'')||
          coalesce((SELECT group_concat(trim(
            coalesce(nullif(s.title,'')||char(10),'')||
            coalesce(nullif(s.instruction,'')||char(10),'')||
            coalesce(nullif(s.body_plain_text,'')||char(10),'')||
            coalesce(nullif(s.code,'')||char(10),'')||
            coalesce(nullif(s.notes,'')||char(10),''),char(10)),char(10))
            FROM knowledge_steps s WHERE s.article_id=a.id),'')||char(10)||
          coalesce((SELECT group_concat(ap.name||char(10)||ap.key,char(10)) FROM article_applications aa JOIN applications ap ON ap.id=aa.application_id WHERE aa.article_id=a.id),'')||char(10)||
          coalesce((SELECT group_concat(t.name||char(10)||t.slug,char(10)) FROM article_tags at JOIN tags t ON t.id=at.tag_id WHERE at.article_id=a.id),''),char(10)),
        trim(coalesce(nullif(a.symptoms,'')||char(10),'')||
          coalesce((SELECT group_concat(nullif(s.code,''),char(10)) FROM knowledge_steps s WHERE s.article_id=a.id),''),char(10)),a.status,a.updated_at
      FROM knowledge_articles a;
      INSERT INTO search_documents(id,entity_type,entity_id,source_label,title,body,exact_terms,status,updated_at)
      SELECT 'support-case:'||id,'support_case',id,'Support case',title,description||char(10)||what_was_tried||char(10)||resolution_notes,description,status,updated_at
      FROM support_cases WHERE status IN ('resolved','closed');
      INSERT INTO search_documents_fts(search_documents_fts) VALUES ('rebuild');`);
    const row = database
      .prepare("SELECT count(*) count FROM search_documents")
      .get() as { count: number };
    return { documents: row.count };
  })();
}
