import { z } from "zod";
import { resolveSameOriginMutationActor } from "@/app/auth/authorisation";
import { jiraPromotionService } from "@/composition/root";
import { ProviderError } from "@/domain/sources/provider";
import { errorResponse } from "@/app/api/v1/articles/http";
export const runtime = "nodejs";
const keySchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,19}-[1-9][0-9]*$/);
export async function POST(
  request: Request,
  context: { params: Promise<{ key: string }> },
) {
  try {
    const actor = await resolveSameOriginMutationActor(request);
    const key = keySchema.parse((await context.params).key);
    const service = jiraPromotionService();
    if (!service) throw new ProviderError("unavailable", false);
    const result = await service.promote(key, actor, request.signal);
    return Response.json(
      { data: result, meta: {} },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
