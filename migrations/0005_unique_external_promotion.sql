CREATE UNIQUE INDEX knowledge_source_links_external_item_unique
ON knowledge_source_links(external_source_id, external_item_key)
WHERE source_kind = 'external_item';
