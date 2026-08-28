import type { ActorIdentity } from "../../domain/identity/actor";
import { localActor } from "./local-actor";

export interface IdentityProvider {
  resolve(request: Request): Promise<ActorIdentity | null>;
}

export class AuthorisationError extends Error {
  constructor(
    public readonly code: "unauthenticated" | "forbidden" | "cross_origin",
    message: string,
    public readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "AuthorisationError";
  }
}

export const localIdentityProvider: IdentityProvider = {
  resolve: async () => localActor(),
};

function enforceSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  const browserFacingOrigin = host
    ? `${requestUrl.protocol}//${host}`
    : requestUrl.origin;
  if (origin && origin !== browserFacingOrigin)
    throw new AuthorisationError(
      "cross_origin",
      "Cross-origin mutations are not permitted",
      403,
    );
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite))
    throw new AuthorisationError(
      "cross_origin",
      "Cross-origin mutations are not permitted",
      403,
    );
}

export async function resolveMutationActor(
  request: Request,
  provider: IdentityProvider = localIdentityProvider,
): Promise<ActorIdentity> {
  enforceSameOrigin(request);
  const actor = await provider.resolve(request);
  if (!actor)
    throw new AuthorisationError(
      "unauthenticated",
      "Authentication is required",
      401,
    );
  if (actor.role !== "editor" && actor.role !== "admin")
    throw new AuthorisationError("forbidden", "Editor access is required", 403);
  return actor;
}
