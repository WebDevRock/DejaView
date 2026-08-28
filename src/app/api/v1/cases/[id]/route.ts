import { resolveMutationActor } from "@/app/auth/authorisation";
import { supportCaseService } from "@/composition/root";
import {
  dataResponse,
  errorResponse,
  validatedArticleId,
  validatedBody,
} from "../../articles/http";
import { updateCaseSchema } from "../contracts";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, context: Context) {
  try {
    return dataResponse(
      supportCaseService().get(validatedArticleId((await context.params).id)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const id = validatedArticleId((await context.params).id);
    const actor = await resolveMutationActor(request);
    const input = await validatedBody(request, updateCaseSchema);
    return dataResponse(supportCaseService().update(id, input, actor));
  } catch (error) {
    return errorResponse(error);
  }
}
