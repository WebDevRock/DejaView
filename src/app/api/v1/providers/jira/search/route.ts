import { z } from "zod";
import { knowledgeSourceProviders } from "@/composition/root";
import { ProviderError } from "@/domain/sources/provider";
import { dataResponse, errorResponse } from "@/app/api/v1/articles/http";
export const runtime = "nodejs";
const querySchema = z
  .object({
    q: z.string().max(500).default(""),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    project: z.string().max(20).optional(),
  })
  .strict();
export async function GET(request: Request) {
  try {
    const input = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const provider = knowledgeSourceProviders().get("jira");
    if (!provider) throw new ProviderError("unavailable", false);
    return dataResponse(
      await provider.search({
        text: input.q,
        limit: input.limit,
        projects: input.project ? [input.project] : undefined,
        signal: request.signal,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
