import { resolveMutationActor } from "@/app/auth/authorisation";
import { knowledgeService } from "@/composition/root";
import { quickCreateSchema } from "../contracts";
import { dataResponse, errorResponse, validatedBody } from "../http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const actor = await resolveMutationActor(request);
    const input = await validatedBody(request, quickCreateSchema);
    return dataResponse(knowledgeService().quickCreate(input, actor), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
