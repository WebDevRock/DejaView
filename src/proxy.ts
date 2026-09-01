import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { accessDecision } from "@/app/auth/access-control";
import { localActor } from "@/app/auth/local-actor";

const isApiRequest = (pathname: string) => pathname.startsWith("/api/");

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const actor = localActor();
  const session = request.auth
    ? {
        userId: request.auth.user.id,
        displayName: request.auth.user.name ?? "DejaView user",
        role: request.auth.user.role,
      }
    : actor
      ? {
          userId: actor.id,
          displayName: actor.displayName,
          role: actor.role,
        }
      : null;
  const decision = accessDecision(pathname, isApiRequest(pathname), session);

  if (decision === "allow") return NextResponse.next();
  if (decision === "api-unauthenticated")
    return NextResponse.json(
      {
        error: {
          code: "unauthenticated",
          message: "Authentication is required",
        },
      },
      { status: 401 },
    );
  if (decision === "forbidden") {
    if (isApiRequest(pathname))
      return NextResponse.json(
        { error: { code: "forbidden", message: "Access is denied" } },
        { status: 403 },
      );
    return NextResponse.redirect(new URL("/auth/forbidden", request.url));
  }

  const signIn = new URL("/auth/signin", request.url);
  signIn.searchParams.set(
    "callbackUrl",
    `${pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(signIn);
});

export const config = {
  matcher: ["/((?!_next/image).*)"],
};
