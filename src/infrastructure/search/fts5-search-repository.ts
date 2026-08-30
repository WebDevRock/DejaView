import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type {
  NormalisedSearchQuery,
  SearchPage,
  SearchPort,
  SearchResult,
} from "../../domain/search/search";
import { compileFts5Query } from "../../application/search/fts-query";
import type { DatabaseConnection } from "../db/client";
import { repairSearchProjection as repairProjection } from "./projection-repair";

type Row = {
  id: string;
  entity_type: "article";
  entity_id: string;
  source_label: string;
  title: string;
  snippet: string;
  status: string;
  updated_at: string;
  rank: number;
  tier: number;
};

type Cursor = z.infer<typeof cursorSchema>["key"];
const cursorSchema = z
  .object({
    v: z.literal(1),
    binding: z.string().regex(/^[a-f0-9]{64}$/),
    key: z
      .object({
        tier: z.number().int().min(0).max(3),
        rank: z.number().finite(),
        updatedAt: z.string().min(1).max(100),
        id: z.string().min(1).max(200),
      })
      .strict(),
  })
  .strict();

function cursorSecret(): string {
  const configured = process.env.DEJAVIEW_CURSOR_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production")
    throw new Error("DEJAVIEW_CURSOR_SECRET must be configured in production");
  return "dejaview-explicit-development-only-cursor-secret";
}

function queryBinding(query: NormalisedSearchQuery): string {
  const normalise = (value?: string) =>
    value?.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB") ?? null;
  const canonical = JSON.stringify({
    text: normalise(query.text),
    source: query.source ?? null,
    application: normalise(query.application),
    tag: normalise(query.tag),
    dateFrom: query.dateFrom ?? null,
    dateTo: query.dateTo ?? null,
    status: query.status ?? null,
  });
  return createHmac("sha256", cursorSecret()).update(canonical).digest("hex");
}

function encodeCursor(key: Cursor, binding: string): string {
  const payload = Buffer.from(
    JSON.stringify({ v: 1, binding, key }),
    "utf8",
  ).toString("base64url");
  const signature = createHmac("sha256", cursorSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function decodeCanonicalBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new z.ZodError([]);
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw new z.ZodError([]);
  return decoded;
}

function decodeCursor(
  value: string | undefined,
  binding: string,
): Cursor | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) throw new z.ZodError([]);
  const [payload, suppliedSignature] = parts as [string, string];
  const decodedPayload = decodeCanonicalBase64Url(payload);
  const supplied = decodeCanonicalBase64Url(suppliedSignature);
  const expectedSignature = createHmac("sha256", cursorSecret())
    .update(payload)
    .digest();
  if (
    supplied.length !== expectedSignature.length ||
    !timingSafeEqual(supplied, expectedSignature)
  )
    throw new z.ZodError([]);
  let decoded: unknown;
  try {
    decoded = JSON.parse(decodedPayload.toString("utf8"));
  } catch {
    throw new z.ZodError([]);
  }
  const parsed = cursorSchema.parse(decoded);
  if (parsed.binding !== binding) throw new z.ZodError([]);
  return parsed.key;
}

const escapeRegularExpression = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function isExact(exactTerms: string, needleBlob: string): number {
  const needles = needleBlob.split("\u0000").filter(Boolean);
  return needles.some((needle) =>
    new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegularExpression(needle)}(?=$|[^\\p{L}\\p{N}])`,
      "iu",
    ).test(exactTerms),
  )
    ? 1
    : 0;
}

const plainSnippet = (value: string) =>
  value
    .replace(/[\u0000-\u001f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export class SqliteFts5SearchRepository implements SearchPort {
  constructor(private readonly connection: DatabaseConnection) {
    connection.sqlite.function(
      "dejaview_exact",
      { deterministic: true },
      isExact,
    );
  }

  async search(query: NormalisedSearchQuery): Promise<SearchPage> {
    const compiled = compileFts5Query(query.text);
    if (!compiled.expression) return { results: [], nextCursor: null };
    const phraseTokens = compiled.exactPhrases.flatMap(
      (phrase) => phrase.match(/[\p{L}\p{N}_.\\/-]+/gu) ?? [],
    );
    const expression = [
      compiled.expression,
      ...phraseTokens.map((term) => `"${term.replaceAll('"', '""')}"`),
    ].join(" OR ");
    const needles = (
      compiled.exactPhrases.length ? compiled.exactPhrases : [query.text.trim()]
    ).filter((needle) => needle.length > 1);
    const needleBlob = needles.join("\u0000");
    const where = [
      "search_documents_fts MATCH ?",
      "d.entity_type='article' AND d.status='published'",
    ];
    const params: unknown[] = [needleBlob, expression];
    if (query.source === "knowledge")
      where.push(
        "NOT EXISTS (SELECT 1 FROM knowledge_source_links l WHERE l.article_id=d.entity_id AND l.source_kind='external' AND l.external_source_id IS NOT NULL)",
      );
    else if (query.source === "external")
      where.push(
        "EXISTS (SELECT 1 FROM knowledge_source_links l WHERE l.article_id=d.entity_id AND l.source_kind='external')",
      );
    else if (query.source) {
      where.push(
        "EXISTS (SELECT 1 FROM knowledge_source_links l JOIN external_sources e ON e.id=l.external_source_id WHERE l.article_id=d.entity_id AND e.provider_type=?)",
      );
      params.push(query.source);
    }
    if (query.dateFrom) {
      where.push("d.updated_at >= ?");
      params.push(query.dateFrom);
    }
    if (query.dateTo) {
      where.push("d.updated_at <= ?");
      params.push(query.dateTo);
    }
    if (query.application) {
      where.push(
        "d.entity_type='article' AND EXISTS (SELECT 1 FROM article_applications aa JOIN applications ap ON ap.id=aa.application_id WHERE aa.article_id=d.entity_id AND (ap.key=? OR lower(ap.name)=lower(?)))",
      );
      params.push(query.application, query.application);
    }
    if (query.tag) {
      where.push(
        "d.entity_type='article' AND EXISTS (SELECT 1 FROM article_tags at JOIN tags t ON t.id=at.tag_id WHERE at.article_id=d.entity_id AND (t.slug=? OR lower(t.name)=lower(?)))",
      );
      params.push(query.tag, query.tag);
    }

    const binding = queryBinding(query);
    const cursor = decodeCursor(query.cursor, binding);
    const keyset = cursor
      ? `WHERE tier > ? OR (tier = ? AND (rank > ? OR (rank = ? AND
          (updated_at < ? OR (updated_at = ? AND id > ?)))))`
      : "";
    if (cursor)
      params.push(
        cursor.tier,
        cursor.tier,
        cursor.rank,
        cursor.rank,
        cursor.updatedAt,
        cursor.updatedAt,
        cursor.id,
      );
    params.push(query.limit + 1);

    const rows = this.connection.sqlite
      .prepare(
        `WITH scored AS (
          SELECT d.id,d.entity_type,d.entity_id,d.source_label,d.title,
            snippet(search_documents_fts,1,'','',' … ',24) snippet,d.status,
            d.updated_at,bm25(search_documents_fts,5.0,1.0,12.0) rank,
            CASE WHEN dejaview_exact(d.exact_terms, ?) = 1
              THEN 0 ELSE 1 END tier
          FROM search_documents_fts
          JOIN search_documents d ON d.rowid=search_documents_fts.rowid

          WHERE ${where.join(" AND ")}
        )
        SELECT * FROM scored ${keyset}
        ORDER BY tier ASC,rank ASC,updated_at DESC,id ASC
        LIMIT ?`,
      )
      .all(...params) as Row[];
    const hasMore = rows.length > query.limit;
    const selected = rows.slice(0, query.limit);
    const results: SearchResult[] = selected.map((row) => ({
      id: row.id,
      kind: row.entity_type,
      title: row.title,
      snippet: plainSnippet(row.snippet || row.title),
      url: `/knowledge/${row.entity_id}`,
      sourceLabel: row.source_label,
      status: "Published",
      score: row.rank,
      exactMatch: row.tier === 0,
      updatedAt: row.updated_at,
      metadata: { entityId: row.entity_id },
    }));
    const last = selected.at(-1);
    return {
      results,
      nextCursor:
        hasMore && last
          ? encodeCursor(
              {
                tier: last.tier,
                rank: last.rank,
                updatedAt: last.updated_at,
                id: last.id,
              },
              binding,
            )
          : null,
    };
  }
}

export function repairSearchProjection(connection: DatabaseConnection): {
  documents: number;
} {
  return repairProjection(connection.sqlite);
}
