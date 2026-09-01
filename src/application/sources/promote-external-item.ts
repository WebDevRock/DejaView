import type { ActorIdentity } from "../../domain/identity/actor";
import type {
  KnowledgeSourceProvider,
  ProviderCommentSelection,
  ProviderItem,
  ProviderProvenance,
  SelectedProviderComment,
} from "../../domain/sources/provider";
import { ProviderError } from "../../domain/sources/provider";

const MAX_COMMENT_PAGES = 10;

export interface ExternalPromotionResult {
  articleId: string;
  duplicate: boolean;
}
export interface ExternalPromotionRepository {
  findExisting(
    sourceId: string,
    externalKey: string,
  ): ExternalPromotionResult | null;
  promote(
    item: ProviderItem,
    actor: ActorIdentity,
    provenance: ProviderProvenance,
    comments: readonly SelectedProviderComment[],
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
    comments: readonly ProviderCommentSelection[] = [],
    signal?: AbortSignal,
  ): Promise<ExternalPromotionResult> {
    const freshItem = await this.provider.getItem(key, { signal });
    const existing = this.repository.findExisting(
      freshItem.sourceId,
      freshItem.externalKey,
    );
    if (existing) {
      if (comments.length)
        throw new ProviderError(
          "promotion_conflict",
          false,
          "Selected comments cannot be added to an existing draft",
        );
      return existing;
    }
    const selectedComments = await this.fetchSelectedComments(
      key,
      comments,
      signal,
    );
    return this.repository.promote(
      freshItem,
      actor,
      this.provider.provenance,
      selectedComments,
    );
  }

  private async fetchSelectedComments(
    key: string,
    selections: readonly ProviderCommentSelection[],
    signal?: AbortSignal,
  ): Promise<SelectedProviderComment[]> {
    if (!selections.length) return [];
    if (!this.provider.getComments)
      throw new ProviderError("invalid_request", false);
    const wanted = new Map(
      selections.map((selection) => [selection.id, selection]),
    );
    const found = new Map<string, SelectedProviderComment>();
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    let pagesFetched = 0;
    while (found.size < wanted.size) {
      if (pagesFetched >= MAX_COMMENT_PAGES)
        throw new ProviderError("invalid_request", false);
      const cursorKey = cursor ?? "0";
      if (seenCursors.has(cursorKey))
        throw new ProviderError("unsafe_response", false);
      seenCursors.add(cursorKey);
      const page = await this.provider.getComments(key, cursor, { signal });
      pagesFetched++;
      for (const comment of page.comments) {
        const selection = wanted.get(comment.id);
        if (selection)
          found.set(comment.id, { ...comment, mapping: selection.mapping });
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    if (found.size !== wanted.size)
      throw new ProviderError("invalid_request", false);
    return selections.map((selection) => found.get(selection.id)!);
  }
}
