import { z } from "zod";
import { knowledgeSourceProviders } from "@/composition/root";
import { ProviderError } from "@/domain/sources/provider";
import { errorResponse } from "@/app/api/v1/articles/http";
export const runtime = "nodejs";
const keySchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,19}-[1-9][0-9]*$/);
const querySchema = z
  .object({
    includeComments: z.enum(["true", "false"]).default("false"),
    cursor: z.string().regex(/^\d+$/).optional(),
  })
  .strict();
export async function GET(
  request: Request,
  context: { params: Promise<{ key: string }> },
) {
  try {
    const key = keySchema.parse((await context.params).key);
    const query = querySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const provider = knowledgeSourceProviders().get("jira");
    if (!provider) throw new ProviderError("unavailable", false);
    const issue = await provider.getItem(key, { signal: request.signal });
    const comments =
      query.includeComments === "true" && provider.getComments
        ? await provider.getComments(key, query.cursor, {
            signal: request.signal,
          })
        : null;
    return Response.json({ data: issue, meta: { comments } });
  } catch (error) {
    return errorResponse(error);
  }
}
