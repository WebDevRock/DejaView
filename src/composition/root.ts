import "server-only";
import path from "node:path";
import { eq } from "drizzle-orm";
import { KnowledgeService } from "../application/articles/knowledge-service";
import { ArticleUsefulnessService } from "../application/articles/article-usefulness-service";
import { RelatedArticleService } from "../application/articles/related-article-service";
import { SupportCaseService } from "../application/cases/support-case-service";
import { SearchService } from "../application/search/search-service";
import { localActor } from "../app/auth/local-actor";
import {
  openDatabase,
  type DatabaseConnection,
} from "../infrastructure/db/client";
import { SqliteKnowledgeArticleRepository } from "../infrastructure/db/knowledge-article-repository";
import { SqliteSupportCaseRepository } from "../infrastructure/db/support-case-repository";
import { runMigrations } from "../infrastructure/db/migrator";
import { SqliteFts5SearchRepository } from "../infrastructure/search/fts5-search-repository";
import { users } from "../infrastructure/db/schema";
import { ProviderRegistry } from "../infrastructure/providers/registry";
import { jiraConfigurationFromEnvironment } from "../infrastructure/providers/jira/config";
import { JiraCloudProvider } from "../infrastructure/providers/jira/provider";
import { PromoteExternalItemService } from "../application/sources/promote-external-item";
import { SqliteExternalPromotionRepository } from "../infrastructure/db/external-promotion-repository";

let connection: DatabaseConnection | undefined;
let knowledge: KnowledgeService | undefined;
let cases: SupportCaseService | undefined;
let usefulness: ArticleUsefulnessService | undefined;
let related: RelatedArticleService | undefined;
let search: SearchService | undefined;
let providerRegistry: ProviderRegistry | undefined;
let jiraPromotion: PromoteExternalItemService | undefined;
export function knowledgeSourceProviders() {
  if (providerRegistry) return providerRegistry;
  providerRegistry = new ProviderRegistry();
  const jira = jiraConfigurationFromEnvironment();
  if (jira) providerRegistry.register(new JiraCloudProvider(jira));
  return providerRegistry;
}
export function jiraPromotionService() {
  const provider = knowledgeSourceProviders().get("jira");
  if (!provider) return null;
  return (jiraPromotion ??= new PromoteExternalItemService(
    provider,
    new SqliteExternalPromotionRepository(database(), knowledgeService()),
  ));
}
function database() {
  if (connection) return connection;
  connection = openDatabase();
  runMigrations(connection.sqlite, path.resolve(process.cwd(), "migrations"));
  const actor = localActor();
  if (
    actor &&
    !connection.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, actor.id))
      .get()
  ) {
    const now = new Date().toISOString();
    connection.db
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
      .run();
  }
  return connection;
}
function articleRepository() {
  return new SqliteKnowledgeArticleRepository(database());
}
export function knowledgeService() {
  return (knowledge ??= new KnowledgeService(articleRepository()));
}
export function supportCaseService() {
  return (cases ??= new SupportCaseService(
    new SqliteSupportCaseRepository(database()),
    undefined,
    knowledgeService(),
  ));
}
export function articleUsefulnessService() {
  return (usefulness ??= new ArticleUsefulnessService(articleRepository()));
}
export function relatedArticleService() {
  return (related ??= new RelatedArticleService(articleRepository()));
}
export function searchService() {
  return (search ??= new SearchService(
    new SqliteFts5SearchRepository(database()),
    knowledgeSourceProviders().all(),
  ));
}
export function resetComposition(): void {
  connection?.close();
  connection = undefined;
  knowledge = undefined;
  cases = undefined;
  usefulness = undefined;
  related = undefined;
  search = undefined;
  providerRegistry = undefined;
  jiraPromotion = undefined;
}
