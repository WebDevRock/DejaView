import "server-only";

import path from "node:path";
import { eq } from "drizzle-orm";
import { KnowledgeService } from "../application/articles/knowledge-service";
import { localActor } from "../app/auth/local-actor";
import {
  openDatabase,
  type DatabaseConnection,
} from "../infrastructure/db/client";
import { SqliteKnowledgeArticleRepository } from "../infrastructure/db/knowledge-article-repository";
import { runMigrations } from "../infrastructure/db/migrator";
import { users } from "../infrastructure/db/schema";

let connection: DatabaseConnection | undefined;
let service: KnowledgeService | undefined;

function ensureLocalActor(database: DatabaseConnection): void {
  const actor = localActor();
  if (!actor) return;
  const existing = database.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, actor.id))
    .get();
  if (existing) return;
  const now = new Date().toISOString();
  database.db
    .insert(users)
    .values({
      id: actor.id,
      externalSubject: "local-development-user",
      displayName: actor.displayName,
      email: "local@dejaview.invalid",
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: users.id })
    .get();
}

export function knowledgeService(): KnowledgeService {
  if (service) return service;
  connection = openDatabase();
  runMigrations(connection.sqlite, path.resolve(process.cwd(), "migrations"));
  ensureLocalActor(connection);
  service = new KnowledgeService(
    new SqliteKnowledgeArticleRepository(connection),
  );
  return service;
}

export function resetComposition(): void {
  connection?.close();
  connection = undefined;
  service = undefined;
}
