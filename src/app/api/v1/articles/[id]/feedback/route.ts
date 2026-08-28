import { z } from "zod";
import { resolveFeedbackActor } from "@/app/auth/authorisation";
import { articleUsefulnessService } from "@/composition/root";
import {
  dataResponse,
  errorResponse,
  validatedArticleId,
  validatedBody,
} from "../../http";
const schema = z
  .object({
    outcome: z.enum(["yes", "no"]),
    differenceNote: z.string().max(5000).optional(),
  })
  .strict();
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, context: Context) {
  try {
    return dataResponse(
      articleUsefulnessService().history(
        validatedArticleId((await context.params).id),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const id = validatedArticleId((await context.params).id);
    const actor = await resolveFeedbackActor(request);
    const input = await validatedBody(request, schema);
    const article = articleUsefulnessService().record(id, input, actor);
    return dataResponse(
      { article, feedback: articleUsefulnessService().history(id)[0] },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
