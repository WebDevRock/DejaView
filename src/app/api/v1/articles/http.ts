import { NextResponse } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import { AuthorisationError } from "@/app/auth/authorisation";
import { KnowledgeArticleError } from "@/domain/knowledge/article";
import { ProviderError } from "@/domain/sources/provider";

export const dataResponse = (data: unknown, status = 200) =>
  NextResponse.json({ data, meta: {} }, { status });

export async function validatedBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ZodError([]);
  }
  return schema.parse(body);
}

const canonicalUuid = z
  .uuid()
  .refine((value) => value === value.toLowerCase(), "UUID must be canonical");

export function validatedArticleId(id: string): string {
  return canonicalUuid.parse(id);
}

export function errorResponse(error: unknown): NextResponse {
  const requestId = crypto.randomUUID();
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: "The request was invalid",
          fieldErrors: error.flatten().fieldErrors,
          requestId,
        },
      },
      { status: 400 },
    );
  if (error instanceof AuthorisationError)
    return NextResponse.json(
      { error: { code: error.code, message: error.message, requestId } },
      { status: error.status },
    );
  if (error instanceof KnowledgeArticleError) {
    const status =
      error.code === "not_found"
        ? 404
        : error.code === "version_conflict"
          ? 409
          : 400;
    return NextResponse.json(
      { error: { code: error.code, message: error.message, requestId } },
      { status },
    );
  }
  if (error instanceof ProviderError) {
    const status =
      error.code === "not_found"
        ? 404
        : error.code === "promotion_conflict"
          ? 409
          : error.code === "invalid_request"
            ? 400
            : error.code === "rate_limited"
              ? 503
              : error.code === "timeout"
                ? 504
                : 502;
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message:
            error.code === "promotion_conflict"
              ? "Selected comments cannot be added to an existing draft"
              : "The external knowledge source request could not be completed",
          requestId,
        },
      },
      { status },
    );
  }
  console.error(`[${requestId}] Unexpected API route error`, error);
  return NextResponse.json(
    {
      error: {
        code: "internal_error",
        message: "An unexpected error occurred",
        requestId,
      },
    },
    { status: 500 },
  );
}
