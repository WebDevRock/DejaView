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
  resolve: async () => {
    const local = localActor();
    if (local) return local;
    if (
      process.env.NODE_ENV === "test" ||
      !process.env.AUTH_MICROSOFT_ENTRA_ID_ID
    )
      return null;
    const { auth, actorFromSession } = await import("../../auth");
    return actorFromSession(await auth());
  },
};

function enforceSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const configuredOrigin = process.env.AUTH_URL?.trim();
  const expectedOrigin = configuredOrigin
    ? new URL(configuredOrigin).origin
    : new URL(request.url).origin;
  if (origin && new URL(origin).origin !== expectedOrigin)
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

export async function resolveSameOriginMutationActor(
  request: Request,
  provider: IdentityProvider = localIdentityProvider,
): Promise<ActorIdentity> {
  if (!request.headers.get("origin"))
    throw new AuthorisationError(
      "cross_origin",
      "A same-origin browser request is required",
      403,
    );
  return resolveMutationActor(request, provider);
}

export async function resolveFeedbackActor(
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
  return actor;
}
