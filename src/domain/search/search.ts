export type SearchSource = "knowledge" | "support_case";
export type SearchKind = "article" | "support_case";

export interface SearchQuery {
  text: string;
  source?: SearchSource;
  application?: string;
  tag?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: "published" | "resolved";
  limit?: number;
  cursor?: string;
}

export interface NormalisedSearchQuery extends SearchQuery {
  limit: number;
}

export interface SearchResult {
  id: string;
  kind: SearchKind;
  title: string;
  snippet: string;
  url: string;
  sourceLabel: string;
  status: "Published" | "Resolved";
  score: number;
  exactMatch: boolean;
  updatedAt: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface SearchPage {
  results: SearchResult[];
  nextCursor: string | null;
}
export interface SearchPort {
  search(query: NormalisedSearchQuery): Promise<SearchPage>;
}
export interface UnifiedSearchResponse extends SearchPage {
  partial: boolean;
  warnings: string[];
}
