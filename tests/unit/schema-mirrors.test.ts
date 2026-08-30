// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { knowledgeSourceLinks as applicationSchema } from "@/infrastructure/db/schema";
import { knowledgeSourceLinks as scriptSchema } from "../../scripts/scripts-safe/schema";

function externalItemUniqueIndex(table: typeof applicationSchema) {
  return getTableConfig(table).indexes.find(
    (index) =>
      index.config.name === "knowledge_source_links_external_item_unique",
  );
}

describe("schema mirrors", () => {
  it("declare the same partial unique external provenance index", () => {
    const applicationIndex = externalItemUniqueIndex(applicationSchema);
    const scriptIndex = externalItemUniqueIndex(scriptSchema);

    expect(applicationIndex?.config.unique).toBe(true);
    expect(scriptIndex?.config.unique).toBe(true);
    expect(applicationIndex?.config.where).toBeDefined();
    expect(scriptIndex?.config.where).toBeDefined();
    const columnNames = (columns: unknown[]) =>
      columns.map((column) => (column as { name: string }).name);
    expect(columnNames(applicationIndex?.config.columns ?? [])).toEqual([
      "external_source_id",
      "external_item_key",
    ]);
    expect(columnNames(scriptIndex?.config.columns ?? [])).toEqual([
      "external_source_id",
      "external_item_key",
    ]);
  });
});
