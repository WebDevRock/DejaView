import { resolveMutationActor } from "@/app/auth/authorisation";
import { supportCaseService } from "@/composition/root";
import {
  dataResponse,
  errorResponse,
  validatedArticleId,
  validatedBody,
} from "../../../articles/http";
import { draftFromCaseSchema } from "../../contracts";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const id = validatedArticleId((await context.params).id);
    const actor = await resolveMutationActor(request);
    const input = await validatedBody(request, draftFromCaseSchema);
    return dataResponse(
      supportCaseService().createDraftArticle(id, input, actor),
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
