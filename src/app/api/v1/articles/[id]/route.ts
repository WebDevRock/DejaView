import { resolveMutationActor } from "@/app/auth/authorisation";
import { knowledgeService } from "@/composition/root";
import { articleUpdateSchema } from "../contracts";
import {
  dataResponse,
  errorResponse,
  validatedArticleId,
  validatedBody,
} from "../http";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    return dataResponse(
      knowledgeService().get(validatedArticleId((await context.params).id)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const id = validatedArticleId((await context.params).id);
    const actor = await resolveMutationActor(request);
    const input = await validatedBody(request, articleUpdateSchema);
    return dataResponse(knowledgeService().update(id, input, actor));
  } catch (error) {
    return errorResponse(error);
  }
}
