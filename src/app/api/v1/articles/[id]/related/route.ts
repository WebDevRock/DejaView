import { relatedArticleService } from "@/composition/root";
import { dataResponse, errorResponse, validatedArticleId } from "../../http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, context: Context) {
  try {
    return dataResponse(
      relatedArticleService().forArticle(
        validatedArticleId((await context.params).id),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
