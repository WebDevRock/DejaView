import type {
  SearchPort,
  SearchQuery,
  UnifiedSearchResponse,
} from "../../domain/search/search";

export class SearchService {
  constructor(private readonly internal: SearchPort) {}
  async search(query: SearchQuery): Promise<UnifiedSearchResponse> {
    const normaliseFilter = (value?: string) => value?.trim() || undefined;
    const normaliseDate = (value: string | undefined, endOfDay: boolean) => {
      const normalised = normaliseFilter(value);
      if (!normalised || !/^\d{4}-\d{2}-\d{2}$/.test(normalised))
        return normalised;
      return `${normalised}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`;
    };
    const page = await this.internal.search({
      ...query,
      text: query.text.trim().replace(/\s+/g, " "),
      application: normaliseFilter(query.application),
      tag: normaliseFilter(query.tag),
      dateFrom: normaliseDate(query.dateFrom, false),
      dateTo: normaliseDate(query.dateTo, true),
      limit: Math.min(50, Math.max(1, query.limit ?? 20)),
    });
    return { ...page, partial: false, warnings: [] };
  }
}
