import type { ActorIdentity } from "../../domain/identity/actor";

export const LOCAL_ACTOR: ActorIdentity = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Local DejaView User",
  role: "editor",
};

export function localActor(): ActorIdentity | null {
  return process.env.DEJAVIEW_LOCAL_AUTH === "true" &&
    process.env.NODE_ENV !== "production"
    ? LOCAL_ACTOR
    : null;
}
