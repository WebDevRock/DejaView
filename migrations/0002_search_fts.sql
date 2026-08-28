CREATE VIRTUAL TABLE search_documents_fts USING fts5(
  title,
  body,
  exact_terms,
  content = 'search_documents',
  content_rowid = 'rowid'
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
