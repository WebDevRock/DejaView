import { z } from "zod";
import { searchService } from "@/composition/root";
import { errorResponse } from "../articles/http";

export const runtime = "nodejs";
const schema = z
  .object({
    q: z.string().max(500).default(""),
    source: z.enum(["knowledge", "external", "jira"]).optional(),
    application: z.string().max(100).optional(),
    tag: z.string().max(100).optional(),
    dateFrom: z.union([z.iso.date(), z.iso.datetime()]).optional(),
    dateTo: z.union([z.iso.date(), z.iso.datetime()]).optional(),
    status: z.enum(["published"]).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(1000).optional(),
  })
  .strict();
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = Object.fromEntries(url.searchParams.entries());
    const { q, ...filters } = schema.parse(input);
    const result = await searchService().search({ text: q, ...filters });
    return Response.json({
      data: result.results,
      meta: {
        nextCursor: result.nextCursor,
        partial: result.partial,
        warnings: result.warnings,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
