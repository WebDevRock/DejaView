import type {
  SearchPort,
  SearchQuery,
  UnifiedSearchResponse,
} from "../../domain/search/search";
import type { KnowledgeSourceProvider } from "../../domain/sources/provider";

export class SearchService {
  constructor(
    private readonly internal: SearchPort,
    private readonly providers: readonly KnowledgeSourceProvider[] = [],
  ) {}
  async search(query: SearchQuery): Promise<UnifiedSearchResponse> {
    const normaliseFilter = (value?: string) => value?.trim() || undefined;
    const normaliseDate = (value: string | undefined, endOfDay: boolean) => {
      const normalised = normaliseFilter(value);
      if (!normalised || !/^\d{4}-\d{2}-\d{2}$/.test(normalised))
        return normalised;
      return `${normalised}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`;
    };
    const normalised = {
      ...query,
      text: query.text.trim().replace(/\s+/g, " "),
      application: normaliseFilter(query.application),
      tag: normaliseFilter(query.tag),
      dateFrom: normaliseDate(query.dateFrom, false),
      dateTo: normaliseDate(query.dateTo, true),
      limit: Math.min(50, Math.max(1, query.limit ?? 20)),
    };
    const eligibleProviders = this.providers.filter((provider) => {
      if (
        normalised.source &&
        !["external", provider.id].includes(normalised.source)
      )
        return false;
      return !normalised.application && !normalised.tag && !normalised.status;
    });
    const includeInternal =
      !normalised.source ||
      ["knowledge", "support_case"].includes(normalised.source);
    const settled = await Promise.allSettled([
      ...(includeInternal ? [this.internal.search(normalised)] : []),
      ...eligibleProviders.map((provider) =>
        provider.search({
          text: normalised.text,
          limit: normalised.limit,
          dateFrom: normalised.dateFrom,
          dateTo: normalised.dateTo,
        }),
      ),
    ]);
    const warnings: string[] = [];
    let page = { results: [], nextCursor: null } as Awaited<
      ReturnType<SearchPort["search"]>
    >;
    let offset = 0;
    if (includeInternal) {
      const internal = settled[0];
      offset = 1;
      if (internal?.status === "fulfilled")
        page = internal.value as Awaited<ReturnType<SearchPort["search"]>>;
      else if (!eligibleProviders.length) throw internal?.reason;
      else warnings.push("Internal search is temporarily unavailable");
    }
    const external = eligibleProviders.flatMap((provider, index) => {
      const result = settled[index + offset];
      if (result?.status !== "fulfilled") {
        warnings.push(`${provider.label} is temporarily unavailable`);
        return [];
      }
      return (
        result.value as Awaited<ReturnType<KnowledgeSourceProvider["search"]>>
      ).map((item) => ({
        id: item.id,
        kind: "external" as const,
        title: item.title,
        snippet: item.snippet,
        url: `/providers/${encodeURIComponent(item.sourceId)}/issues/${encodeURIComponent(item.externalKey)}`,
        sourceLabel: item.sourceLabel,
        status: item.status,
        displayStatus: item.displayStatus,
        score: item.score,
        exactMatch: false,
        updatedAt: item.updatedAt,
        metadata: {
          ...item.metadata,
          externalKey: item.externalKey,
          sourceId: item.sourceId,
          externalUrl: item.url,
        },
      }));
    });
    const results = [...page.results, ...external]
      .filter(
        (item, index, all) =>
          all.findIndex((other) => other.id === item.id) === index,
      )
      .sort(
        (left, right) =>
          tier(left) - tier(right) ||
          Number(right.exactMatch) - Number(left.exactMatch) ||
          right.score - left.score ||
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, normalised.limit);
    return {
      results,
      nextCursor: page.nextCursor,
      partial: warnings.length > 0,
      warnings,
    };
  }
}

function tier(result: {
  kind: string;
  exactMatch: boolean;
  status: string;
}): number {
  if (result.exactMatch) return 0;
  if (result.kind === "article" && result.status === "Published") return 1;
  if (result.kind === "support_case" && result.status === "Resolved") return 2;
  return 3;
}
