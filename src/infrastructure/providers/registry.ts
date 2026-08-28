import type { KnowledgeSourceProvider } from "../../domain/sources/provider";

export class ProviderRegistry {
  private readonly providers = new Map<string, KnowledgeSourceProvider>();
  register(provider: KnowledgeSourceProvider): void {
    if (this.providers.has(provider.id))
      throw new Error(`Provider ${provider.id} is already registered`);
    this.providers.set(provider.id, provider);
  }
  get(id: string): KnowledgeSourceProvider | undefined {
    return this.providers.get(id);
  }
  all(): readonly KnowledgeSourceProvider[] {
    return [...this.providers.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
  }
}
