import type { ActorIdentity } from "../../domain/identity/actor";
import type {
  KnowledgeSourceProvider,
  ProviderItem,
  ProviderProvenance,
} from "../../domain/sources/provider";

export interface ExternalPromotionResult {
  articleId: string;
  duplicate: boolean;
}
export interface ExternalPromotionRepository {
  promote(
    item: ProviderItem,
    actor: ActorIdentity,
    provenance: ProviderProvenance,
  ): ExternalPromotionResult;
}
export class PromoteExternalItemService {
  constructor(
    private readonly provider: KnowledgeSourceProvider,
    private readonly repository: ExternalPromotionRepository,
  ) {}
  async promote(
    key: string,
    actor: ActorIdentity,
    signal?: AbortSignal,
  ): Promise<ExternalPromotionResult> {
    const freshItem = await this.provider.getItem(key, { signal });
    return this.repository.promote(freshItem, actor, this.provider.provenance);
  }
}
