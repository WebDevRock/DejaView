export type SafeContentNode =
  | { type: "text"; text: string; href?: string }
  | { type: "paragraph" | "listItem"; children: SafeContentNode[] }
  | {
      type: "heading";
      level: 1 | 2 | 3 | 4 | 5 | 6;
      children: SafeContentNode[];
    }
  | { type: "bulletList" | "orderedList"; children: SafeContentNode[] }
  | { type: "codeBlock"; text: string; language?: string }
  | { type: "hardBreak" };

export interface ProviderCapabilities {
  search: true;
  itemDetail: true;
  comments: boolean;
  supportedFilters: readonly ("project" | "date")[];
}
export interface ProviderProvenance {
  providerType: string;
  secretEnvRef: string;
  promotionGuidance: string;
}
export interface ProviderSearchQuery {
  text: string;
  limit: number;
  projects?: readonly string[];
  dateFrom?: string;
  dateTo?: string;
  signal?: AbortSignal;
}
export interface ProviderSearchResult {
  id: string;
  externalKey: string;
  title: string;
  snippet: string;
  url: string;
  sourceId: string;
  sourceLabel: string;
  status: ExternalStatus;
  displayStatus?: string;
  score: number;
  updatedAt: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}
export type ExternalStatus =
  "open" | "in_progress" | "resolved" | "closed" | "unknown";
export interface ProviderItem extends ProviderSearchResult {
  content: SafeContentNode[];
  plainText: string;
}
export interface ProviderComment {
  id: string;
  author: string;
  createdAt: string;
  content: SafeContentNode[];
  plainText: string;
}
export type ProviderCommentMapping = "context" | "step";
export interface ProviderCommentSelection {
  id: string;
  mapping: ProviderCommentMapping;
}
export interface SelectedProviderComment extends ProviderComment {
  mapping: ProviderCommentMapping;
}
export interface ProviderCommentPage {
  comments: ProviderComment[];
  nextCursor: string | null;
}
export interface KnowledgeSourceProvider {
  readonly id: string;
  readonly label: string;
  readonly provenance: ProviderProvenance;
  readonly capabilities: ProviderCapabilities;
  search(query: ProviderSearchQuery): Promise<ProviderSearchResult[]>;
  getItem(
    key: string,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderItem>;
  getComments?(
    key: string,
    cursor?: string,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderCommentPage>;
}
export type ProviderErrorCode =
  | "invalid_request"
  | "promotion_conflict"
  | "unauthorised"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "unsafe_response";
export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    public readonly retryable: boolean,
    message = "External knowledge source request failed",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
