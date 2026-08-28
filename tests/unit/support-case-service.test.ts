import { describe, expect, it } from "vitest";
import {
  SupportCaseService,
  type SupportCaseRepository,
} from "@/application/cases/support-case-service";
import type { SupportCase } from "@/domain/support/support-case";

class MemoryCases implements SupportCaseRepository {
  rows = new Map<string, SupportCase>();
  articleIds = new Set<string>();
  transaction<T>(operation: () => T) {
    return operation();
  }
  create(value: SupportCase) {
    this.rows.set(value.id, value);
    return value;
  }
  list() {
    return [...this.rows.values()];
  }
  get(id: string) {
    return this.rows.get(id) ?? null;
  }
  update(value: SupportCase, expectedVersion: number) {
    if (this.rows.get(value.id)?.version !== expectedVersion) return null;
    this.rows.set(value.id, value);
    return value;
  }
  articleExists(id: string) {
    return this.articleIds.has(id);
  }
}
const actor = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Editor",
  role: "editor" as const,
};
let id = 10;
const service = (repo: MemoryCases) =>
  new SupportCaseService(repo, {
    now: () => "2026-08-28T13:00:00.000Z",
    id: () => `00000000-0000-4000-8000-${String(id++).padStart(12, "0")}`,
  });

describe("SupportCaseService", () => {
  it("creates, lists, edits, links and resolves a case", () => {
    const repo = new MemoryCases();
    const cases = service(repo);
    const created = cases.create(
      {
        title: "Payroll failed",
        description: "Export stopped",
        occurredAt: "2026-08-28T09:15:00.000Z",
        whatWasTried: "Restarted service",
      },
      actor,
    );
    expect(created).toMatchObject({
      status: "Open",
      stableKey: expect.stringMatching(/^CASE-/),
      articleId: null,
    });
    expect(cases.list()).toEqual([created]);
    repo.articleIds.add("00000000-0000-4000-8000-000000000099");
    const linked = cases.update(
      created.id,
      {
        title: created.title,
        description: created.description,
        occurredAt: created.occurredAt,
        whatWasTried: created.whatWasTried,
        articleId: "00000000-0000-4000-8000-000000000099",
        expectedVersion: created.version,
      },
      actor,
    );
    const resolved = cases.resolve(
      created.id,
      {
        resolutionNotes: "Rebuilt export view",
        expectedVersion: linked.version,
      },
      actor,
    );
    expect(resolved).toMatchObject({
      status: "Resolved",
      resolutionNotes: "Rebuilt export view",
      resolvedByUserId: actor.id,
      resolvedAt: "2026-08-28T13:00:00.000Z",
    });
  });

  it("rejects missing required text and stale updates", () => {
    const repo = new MemoryCases();
    const cases = service(repo);
    expect(() =>
      cases.create(
        {
          title: " ",
          description: "x",
          occurredAt: "2026-08-28T09:15:00.000Z",
          whatWasTried: "",
        },
        actor,
      ),
    ).toThrow(/title/i);
    const created = cases.create(
      {
        title: "A",
        description: "B",
        occurredAt: "2026-08-28T09:15:00.000Z",
        whatWasTried: "",
      },
      actor,
    );
    const changed = cases.update(
      created.id,
      { ...created, title: "Changed", expectedVersion: created.version },
      actor,
    );
    expect(changed.updatedAt).toBe(created.updatedAt);
    expect(changed.version).toBe(created.version + 1);
    expect(() =>
      cases.update(
        created.id,
        { ...created, title: "Stale reuse", expectedVersion: created.version },
        actor,
      ),
    ).toThrow(/stale/i);
  });

  it("rejects invalid article mappings before writing", () => {
    const repo = new MemoryCases();
    const cases = service(repo);
    expect(() =>
      cases.create(
        {
          title: "A",
          description: "B",
          occurredAt: "2026-08-28T09:15:00.000Z",
          whatWasTried: "",
          articleId: "00000000-0000-4000-8000-000000000099",
        },
        actor,
      ),
    ).toThrow(/article.*not found/i);
    expect(repo.rows.size).toBe(0);
  });
});
