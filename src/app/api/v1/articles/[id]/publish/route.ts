import { resolveMutationActor } from "@/app/auth/authorisation";
import { knowledgeService } from "@/composition/root";
import { publishSchema } from "../../contracts";
import {
  dataResponse,
  errorResponse,
  validatedArticleId,
  validatedBody,
} from "../../http";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const id = validatedArticleId((await context.params).id);
    const actor = await resolveMutationActor(request);
    const { version } = await validatedBody(request, publishSchema);
    return dataResponse(knowledgeService().publish(id, version, actor));
  } catch (error) {
    return errorResponse(error);
  }
}
