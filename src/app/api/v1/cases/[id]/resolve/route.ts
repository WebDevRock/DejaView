import { resolveMutationActor } from "@/app/auth/authorisation";
import { supportCaseService } from "@/composition/root";
import {
  dataResponse,
  errorResponse,
  validatedArticleId,
  validatedBody,
} from "../../../articles/http";
import { resolveCaseSchema } from "../../contracts";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const id = validatedArticleId((await context.params).id);
    const actor = await resolveMutationActor(request);
    const input = await validatedBody(request, resolveCaseSchema);
    return dataResponse(supportCaseService().resolve(id, input, actor));
  } catch (error) {
    return errorResponse(error);
  }
}
