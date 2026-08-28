import { knowledgeService } from "@/composition/root";
import { dataResponse, errorResponse } from "./http";

export const runtime = "nodejs";

export async function GET() {
  try {
    return dataResponse(knowledgeService().list());
  } catch (error) {
    return errorResponse(error);
  }
}
