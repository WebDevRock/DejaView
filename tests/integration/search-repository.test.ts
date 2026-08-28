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
        `INSERT INTO knowledge_articles (id,stable_key,title,summary,problem,symptoms,resolution_summary,status,version,use_count,created_by_user_id,updated_by_user_id,published_by_user_id,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,0,'u','u',?,?,?,?)`,
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
  db.prepare(
    `INSERT INTO support_cases (id,stable_key,title,description,occurred_at,what_was_tried,resolution_notes,status,version,created_by_user_id,resolved_by_user_id,resolved_at,created_at,updated_at) VALUES ('c','c','Case exact','SQLSTATE 42P01',?,'Restart','Restore','resolved',1,'u','u',?,?,?)`,
  ).run(now, now, now, now);
  const doc = db.prepare(
    "INSERT INTO search_documents VALUES (?,?,?,?,?,?,?,?,?)",
  );
  doc.run(
    "article:a-exact",
    "article",
    "a-exact",
    "Knowledge",
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
    "Knowledge",
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
    "Knowledge",
    "Hidden draft",
    "SQLSTATE 42P01",
    "SQLSTATE 42P01",
    "draft",
    now,
  );
  doc.run(
    "support-case:c",
    "support_case",
    "c",
    "Support case",
    "Case exact",
    "SQLSTATE 42P01 Restart Restore",
    "SQLSTATE 42P01",
    "resolved",
    now,
  );
  return { connection, repository: new SqliteFts5SearchRepository(connection) };
}
afterEach(() => {
  for (const r of resources.splice(0)) {
    r.connection.close();
    fs.rmSync(r.directory, { recursive: true, force: true });
  }
});

describe("SQLite unified FTS5 search", () => {
  it("ranks exact phrase matches first, articles before cases, and excludes drafts", async () => {
    const { repository } = fixture();
    const page = await repository.search({
      text: '"SQLSTATE 42P01"',
      limit: 20,
    });
    expect(page.results.map((r) => r.id)).toEqual([
      "article:a-exact",
      "support-case:c",
      "article:a-ordinary",
    ]);
    expect(page.results.map((r) => r.sourceLabel)).toEqual([
      "Knowledge",
      "Support case",
      "Knowledge",
    ]);
    expect(page.results.every((r) => !r.snippet.includes("<"))).toBe(true);
  });
  it("applies source/date/status filters and paginates deterministically", async () => {
    const { connection, repository } = fixture();
    const prepare = vi.spyOn(connection.sqlite, "prepare");
    const first = await repository.search({
      text: "SQLSTATE",
      source: "knowledge",
      status: "published",
      dateFrom: "2026-08-28T00:00:00.000Z",
      limit: 1,
    });
    expect(first.results).toHaveLength(1);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await repository.search({
      text: "SQLSTATE",
      source: "knowledge",
      status: "published",
      dateFrom: "2026-08-28T00:00:00.000Z",
      limit: 1,
      cursor: first.nextCursor!,
    });
    expect(second.results[0]?.id).not.toBe(first.results[0]?.id);
    const searchSql = prepare.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.includes("search_documents_fts"));
    expect(searchSql).toHaveLength(2);
    expect(searchSql.every((sql) => /LIMIT\s+\?/i.test(sql))).toBe(true);
    expect(searchSql.every((sql) => !/\bOFFSET\b/i.test(sql))).toBe(true);
  });
  it("includes timestamps late on dateTo and excludes the next UTC day", async () => {
    const { connection, repository } = fixture();
    connection.sqlite
      .prepare(
        "UPDATE search_documents SET updated_at='2026-08-28T23:59:59.999Z' WHERE id='article:a-exact'",
      )
      .run();
    const page = await repository.search({
      text: "SQLSTATE",
      source: "knowledge",
      dateTo: "2026-08-28T23:59:59.999Z",
      limit: 20,
    });
    expect(page.results.map((result) => result.id)).toContain(
      "article:a-exact",
    );
    expect(page.results.map((result) => result.id)).not.toContain(
      "article:a-ordinary",
    );
  });
  it("repairs missing and stale projection rows and rebuilds FTS", () => {
    const { connection } = fixture();
    connection.sqlite
      .prepare("DELETE FROM search_documents WHERE id='article:a-exact'")
      .run();
    const report = repairSearchProjection(connection);
    expect(report.documents).toBe(4);
    expect(
      connection.sqlite
        .prepare(
          "SELECT count(*) count FROM search_documents_fts WHERE search_documents_fts MATCH '42P01'",
        )
        .get(),
    ).toEqual({ count: 4 });
  });

  it("rejects malformed, tampered and cross-query cursors", async () => {
    const { repository } = fixture();
    await expect(
      repository.search({ text: "SQLSTATE", limit: 1, cursor: "not-a-cursor" }),
    ).rejects.toMatchObject({ name: "ZodError" });
    const first = await repository.search({ text: "SQLSTATE", limit: 1 });
    expect(first.nextCursor).toEqual(expect.any(String));
    const cursor = first.nextCursor!;
    const [payload, signature] = cursor.split(".") as [string, string];
    for (const candidate of [
      `${cursor.slice(0, -1)}x`,
      `${payload}!.${signature}`,
      `${payload}.${signature}!`,
      `${payload}=.${signature}`,
      `${payload}.${signature}=`,
      `${payload.slice(0, -1)}x.${signature}`,
      `.${signature}`,
      `${payload}.`,
      `${payload}..${signature}`,
    ])
      await expect(
        repository.search({ text: "SQLSTATE", limit: 1, cursor: candidate }),
      ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      repository.search({
        text: "payroll",
        limit: 1,
        cursor: first.nextCursor!,
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
  });

  it("applies application and tag filters in repository execution", async () => {
    const { connection, repository } = fixture();
    connection.sqlite.exec(`
      INSERT INTO applications VALUES ('app','payroll','Payroll','','2026-08-28','2026-08-28');
      INSERT INTO tags VALUES ('tag','database','Database','2026-08-28','2026-08-28');
      INSERT INTO article_applications VALUES ('a-exact','app','2026-08-28');
      INSERT INTO article_tags VALUES ('a-exact','tag','2026-08-28');
    `);
    const page = await repository.search({
      text: "SQLSTATE",
      application: "payroll",
      tag: "database",
      limit: 20,
    });
    expect(page.results.map((result) => result.id)).toEqual([
      "article:a-exact",
    ]);
  });

  it("binds a cursor to every individual search filter", async () => {
    const { connection, repository } = fixture();
    connection.sqlite.exec(`
      INSERT INTO applications VALUES ('app','payroll','Payroll','','2026-08-28','2026-08-28');
      INSERT INTO tags VALUES ('tag','database','Database','2026-08-28','2026-08-28');
      INSERT INTO article_applications VALUES ('a-exact','app','2026-08-28');
      INSERT INTO article_applications VALUES ('a-ordinary','app','2026-08-28');
      INSERT INTO article_tags VALUES ('a-exact','tag','2026-08-28');
      INSERT INTO article_tags VALUES ('a-ordinary','tag','2026-08-28');
    `);
    const base = {
      text: "SQLSTATE",
      source: "knowledge" as const,
      application: "payroll",
      tag: "database",
      dateFrom: "2026-08-01T00:00:00.000Z",
      dateTo: "2026-08-30T23:59:59.999Z",
      status: "published" as const,
      limit: 1,
    };
    const first = await repository.search(base);
    expect(first.nextCursor).toEqual(expect.any(String));
    for (const change of [
      { source: "support_case" as const },
      { application: "finance" },
      { tag: "reporting" },
      { dateFrom: "2026-08-02T00:00:00.000Z" },
      { dateTo: "2026-08-29T23:59:59.999Z" },
      { status: "resolved" as const },
    ])
      await expect(
        repository.search({ ...base, ...change, cursor: first.nextCursor! }),
      ).rejects.toMatchObject({ name: "ZodError" });
  });

  it("includes both resolved and closed historical cases for resolved status", async () => {
    const { connection, repository } = fixture();
    const now = "2026-08-30T12:00:00.000Z";
    connection.sqlite
      .prepare(
        `INSERT INTO support_cases (id,stable_key,title,description,occurred_at,what_was_tried,resolution_notes,status,version,created_by_user_id,resolved_by_user_id,resolved_at,created_at,updated_at) VALUES ('closed','closed','Closed case','SQLSTATE 42P01',?,'Restart','Restore','closed',1,'u','u',?,?,?)`,
      )
      .run(now, now, now, now);
    connection.sqlite
      .prepare("INSERT INTO search_documents VALUES (?,?,?,?,?,?,?,?,?)")
      .run(
        "support-case:closed",
        "support_case",
        "closed",
        "Support case",
        "Closed case",
        "SQLSTATE 42P01 Restart Restore",
        "SQLSTATE 42P01",
        "closed",
        now,
      );
    const page = await repository.search({
      text: '"SQLSTATE 42P01"',
      status: "resolved",
      limit: 20,
    });
    expect(page.results.map((result) => result.id).sort()).toEqual([
      "support-case:c",
      "support-case:closed",
    ]);
  });

  it("uses exact boundaries and executes malicious punctuation safely", async () => {
    const { connection, repository } = fixture();
    connection.sqlite
      .prepare(
        "UPDATE search_documents SET body='E4 details', exact_terms='E42' WHERE id='article:a-ordinary'",
      )
      .run();
    const boundary = await repository.search({ text: "E4", limit: 20 });
    expect(boundary.results).toHaveLength(1);
    expect(boundary.results[0]).toMatchObject({
      id: "article:a-ordinary",
      exactMatch: false,
    });
    await expect(
      repository.search({ text: `' )) NOT NEAR/1 {foo} * ^ : --`, limit: 20 }),
    ).resolves.toEqual({ results: [], nextCursor: null });
  });
});
