import type { ActorIdentity } from "../../domain/identity/actor";

export interface AccessSession {
  userId: string;
  displayName: string;
  role: ActorIdentity["role"] | null;
}

export interface AccessGroups {
  reader: string;
  editor: string;
  admin: string;
}

export type AccessDecision =
  "allow" | "page-unauthenticated" | "api-unauthenticated" | "forbidden";

export function roleFromGroupIds(
  groupIds: readonly string[],
  groups: AccessGroups,
): ActorIdentity["role"] | null {
  const memberships = new Set(groupIds.map((group) => group.toLowerCase()));
  if (memberships.has(groups.admin.toLowerCase())) return "admin";
  if (memberships.has(groups.editor.toLowerCase())) return "editor";
  if (memberships.has(groups.reader.toLowerCase())) return "viewer";
  return null;
}

export function accessDecision(
  pathname: string,
  isApi: boolean,
  session: AccessSession | null,
): AccessDecision {
  if (
    pathname.startsWith("/api/auth/") ||
    pathname === "/auth/signin" ||
    pathname === "/auth/forbidden"
  )
    return "allow";
  if (!session) return isApi ? "api-unauthenticated" : "page-unauthenticated";
  return session.role ? "allow" : "forbidden";
}

export function isPublicAuthPath(pathname: string): boolean {
  if (pathname === "/auth/signin" || pathname === "/auth/forbidden")
    return true;
  return /^\/api\/auth\/(?:callback|csrf|error|providers|session|signin|signout)(?:\/|$)/.test(
    pathname,
  );
}
