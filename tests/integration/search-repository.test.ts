// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openDatabase,
  type DatabaseConnection,
} from "@/infrastructure/db/client";
import { runMigrations } from "@/infrastructure/db/migrator";
import {
  SqliteFts5SearchRepository,
  repairSearchProjection,
} from "@/infrastructure/search/fts5-search-repository";

const resources: { connection: DatabaseConnection; directory: string }[] = [];
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dejaview-search-"));
  const connection = openDatabase(path.join(directory, "test.sqlite"));
  resources.push({ connection, directory });
  runMigrations(connection.sqlite, path.resolve(process.cwd(), "migrations"));
  const db = connection.sqlite;
  const now = "2026-08-28T12:00:00.000Z";
  db.prepare(
    "INSERT INTO users VALUES ('u',NULL,'User',NULL,'active',?,?)",
  ).run(now, now);
  const article = (
    id: string,
    status: string,
    title: string,
    updated: string,
  ) =>
    db
      .prepare(
        `INSERT INTO knowledge_articles
      (id,stable_key,title,summary,problem,symptoms,resolution_summary,status,version,use_count,created_by_user_id,updated_by_user_id,published_by_user_id,published_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,1,0,'u','u',?,?,?,?)`,
      )
      .run(
        id,
        id,
        title,
        "Summary",
        title,
        "SQLSTATE 42P01",
        "Restore view",
        status,
        status === "published" ? "u" : null,
        status === "published" ? updated : null,
        updated,
        updated,
      );
  article("a-exact", "published", "Payroll exact", now);
  article(
    "a-ordinary",
    "published",
    "SQLSTATE payroll guide",
    "2026-08-29T12:00:00.000Z",
  );
  article("a-draft", "draft", "Hidden draft", now);
  const doc = db.prepare(
    "INSERT INTO search_documents VALUES (?,?,?,?,?,?,?,?,?)",
  );
  doc.run(
    "article:a-exact",
    "article",
    "a-exact",
    "DejaView knowledge",
    "Payroll exact",
    "Summary Restore view Payroll Database",
    "SQLSTATE 42P01",
    "published",
    now,
  );
  doc.run(
    "article:a-ordinary",
    "article",
    "a-ordinary",
    "DejaView knowledge",
    "SQLSTATE payroll guide",
    "42P01 details Payroll",
    "",
    "published",
    "2026-08-29T12:00:00.000Z",
  );
  doc.run(
    "article:a-draft",
    "article",
    "a-draft",
    "DejaView knowledge",
    "Hidden draft",
    "SQLSTATE 42P01",
    "SQLSTATE 42P01",
    "draft",
    now,
  );
  return { connection, repository: new SqliteFts5SearchRepository(connection) };
}
afterEach(() => {
  for (const resource of resources.splice(0)) {
    resource.connection.close();
    fs.rmSync(resource.directory, { recursive: true, force: true });
  }
});

describe("SQLite article FTS5 search", () => {
  it("ranks exact phrase matches first and excludes drafts", async () => {
    const page = await fixture().repository.search({
      text: '"SQLSTATE 42P01"',
      limit: 20,
    });
    expect(page.results.map((result) => result.id)).toEqual([
      "article:a-exact",
      "article:a-ordinary",
    ]);
    expect(
      page.results.every(
        (result) =>
          result.kind === "article" && result.url.startsWith("/knowledge/"),
      ),
    ).toBe(true);
    expect(page.results.every((result) => !result.snippet.includes("<"))).toBe(
      true,
    );
  });

  it("applies filters and paginates deterministically without OFFSET", async () => {
    const { connection, repository } = fixture();
    connection.sqlite.exec(`
      INSERT INTO applications VALUES ('app','payroll','Payroll','','2026-08-28','2026-08-28');
      INSERT INTO tags VALUES ('tag','database','Database','2026-08-28','2026-08-28');
      INSERT INTO article_applications VALUES ('a-exact','app','2026-08-28');
      INSERT INTO article_applications VALUES ('a-ordinary','app','2026-08-28');
      INSERT INTO article_tags VALUES ('a-exact','tag','2026-08-28');
      INSERT INTO article_tags VALUES ('a-ordinary','tag','2026-08-28');
    `);
    const prepare = vi.spyOn(connection.sqlite, "prepare");
    const query = {
      text: "SQLSTATE",
      source: "knowledge" as const,
      application: "payroll",
      tag: "database",
      status: "published" as const,
      limit: 1,
    };
    const first = await repository.search(query);
    const second = await repository.search({
      ...query,
      cursor: first.nextCursor!,
    });
    expect(first.results).toHaveLength(1);
    expect(second.results[0]?.id).not.toBe(first.results[0]?.id);
    const sql = prepare.mock.calls
      .map(([value]) => String(value))
      .filter((value) => value.includes("search_documents_fts"));
    expect(
      sql.every(
        (value) => /LIMIT\s+\?/i.test(value) && !/\bOFFSET\b/i.test(value),
      ),
    ).toBe(true);
  });

  it("binds cursors to provider-neutral source filters", async () => {
    const { repository } = fixture();
    const first = await repository.search({
      text: "SQLSTATE",
      source: "knowledge",
      limit: 1,
    });
    await expect(
      repository.search({
        text: "SQLSTATE",
        source: "external",
        limit: 1,
        cursor: first.nextCursor!,
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });

  it("repairs only article projections and rebuilds FTS", () => {
    const { connection } = fixture();
    connection.sqlite
      .prepare("DELETE FROM search_documents WHERE id='article:a-exact'")
      .run();
    expect(repairSearchProjection(connection)).toEqual({ documents: 3 });
    expect(
      connection.sqlite
        .prepare("SELECT DISTINCT entity_type FROM search_documents")
        .all(),
    ).toEqual([{ entity_type: "article" }]);
    expect(
      connection.sqlite
        .prepare(
          "SELECT count(*) count FROM search_documents_fts WHERE search_documents_fts MATCH '42P01'",
        )
        .get(),
    ).toEqual({ count: 3 });
  });

  it("uses exact boundaries and executes malicious punctuation safely", async () => {
    const { connection, repository } = fixture();
    connection.sqlite
      .prepare(
        "UPDATE search_documents SET body='E4 details', exact_terms='E42' WHERE id='article:a-ordinary'",
      )
      .run();
    const boundary = await repository.search({ text: "E4", limit: 20 });
    expect(boundary.results).toEqual([
      expect.objectContaining({ id: "article:a-ordinary", exactMatch: false }),
    ]);
    await expect(
      repository.search({ text: `' )) NOT NEAR/1 {foo} * ^ : --`, limit: 20 }),
    ).resolves.toEqual({ results: [], nextCursor: null });
  });
});
