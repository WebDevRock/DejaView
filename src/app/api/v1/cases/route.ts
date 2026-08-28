import { resolveMutationActor } from "@/app/auth/authorisation";
import { supportCaseService } from "@/composition/root";
import { dataResponse, errorResponse, validatedBody } from "../articles/http";
import { createCaseSchema } from "./contracts";
export const runtime = "nodejs";
export async function GET() {
  try {
    return dataResponse(supportCaseService().list());
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await resolveMutationActor(request);
    const input = await validatedBody(request, createCaseSchema);
    return dataResponse(supportCaseService().create(input, actor), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
