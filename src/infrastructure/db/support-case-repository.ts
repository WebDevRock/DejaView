import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import type { SupportCaseRepository } from "../../application/cases/support-case-service";
import type {
  SupportCase,
  SupportCaseStatus,
} from "../../domain/support/support-case";
import type { DatabaseConnection } from "./client";
import { knowledgeArticles, searchDocuments, supportCases } from "./schema";

const databaseStatus = (status: SupportCaseStatus) =>
  status.toLocaleLowerCase("en-GB") as "open" | "resolved" | "closed";
const domainStatus = (status: "open" | "resolved" | "closed") =>
  `${status[0]!.toUpperCase()}${status.slice(1)}` as SupportCaseStatus;

export class SqliteSupportCaseRepository implements SupportCaseRepository {
  constructor(private readonly connection: DatabaseConnection) {}
  transaction<T>(operation: () => T): T {
    return this.connection.sqlite.transaction(operation)();
  }
  create(value: SupportCase) {
    this.connection.db.insert(supportCases).values(this.values(value)).run();
    return this.required(value.id);
  }
  list() {
    return this.connection.db
      .select()
      .from(supportCases)
      .orderBy(desc(supportCases.updatedAt), asc(supportCases.id))
      .all()
      .map((row) => ({ ...row, status: domainStatus(row.status) }));
  }
  get(id: string) {
    const row = this.connection.db
      .select()
      .from(supportCases)
      .where(eq(supportCases.id, id))
      .get();
    return row ? { ...row, status: domainStatus(row.status) } : null;
  }
  articleExists(id: string) {
    return Boolean(
      this.connection.db
        .select({ id: knowledgeArticles.id })
        .from(knowledgeArticles)
        .where(eq(knowledgeArticles.id, id))
        .get(),
    );
  }
  update(value: SupportCase, expectedVersion: number) {
    const changed = this.connection.sqlite.transaction(() => {
      const result = this.connection.db
        .update(supportCases)
        .set(this.values(value))
        .where(
          and(
            eq(supportCases.id, value.id),
            eq(supportCases.version, expectedVersion),
          ),
        )
        .returning({ id: supportCases.id })
        .get();
      if (!result) return false;
      if (value.status === "Resolved" || value.status === "Closed")
        this.writeProjection(value);
      else
        this.connection.db
          .delete(searchDocuments)
          .where(
            and(
              eq(searchDocuments.entityType, "support_case"),
              eq(searchDocuments.entityId, value.id),
            ),
          )
          .run();
      return true;
    })();
    return changed ? this.required(value.id) : null;
  }
  private required(id: string) {
    const value = this.get(id);
    if (!value) throw new Error(`Support case ${id} missing after persistence`);
    return value;
  }
  private values(value: SupportCase) {
    return { ...value, status: databaseStatus(value.status) };
  }
  private writeProjection(value: SupportCase) {
    const body = [value.description, value.whatWasTried, value.resolutionNotes]
      .filter(Boolean)
      .join("\n");
    this.connection.db
      .insert(searchDocuments)
      .values({
        id: `support-case:${value.id}`,
        entityType: "support_case",
        entityId: value.id,
        sourceLabel: "Support case",
        title: value.title,
        body,
        exactTerms: value.description,
        status: databaseStatus(value.status),
        updatedAt: value.updatedAt,
      })
      .onConflictDoUpdate({
        target: [searchDocuments.entityType, searchDocuments.entityId],
        set: {
          title: value.title,
          body,
          exactTerms: value.description,
          status: databaseStatus(value.status),
          updatedAt: value.updatedAt,
          sourceLabel: "Support case",
        },
      })
      .run();
  }
}
