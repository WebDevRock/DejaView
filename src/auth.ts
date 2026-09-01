import NextAuth, { type Session } from "next-auth";
import MicrosoftEntraID, {
  type MicrosoftEntraIDProfile,
} from "next-auth/providers/microsoft-entra-id";
import type { ActorIdentity } from "./domain/identity/actor";
import { ensureActorUser } from "./composition/root";
import { entraGraphAuthoriser } from "./infrastructure/auth/entra-graph";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured`);
  return value;
};

type EntraProfile = MicrosoftEntraIDProfile & {
  groups?: string[];
  _claim_names?: { groups?: string };
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: required("AUTH_SECRET"),
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [
    MicrosoftEntraID({
      clientId: required("AUTH_MICROSOFT_ENTRA_ID_ID"),
      clientSecret: required("AUTH_MICROSOFT_ENTRA_ID_SECRET"),
      issuer: `https://login.microsoftonline.com/${required("AUTH_MICROSOFT_ENTRA_ID_TENANT_ID")}/v2.0`,
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "microsoft-entra-id" || !profile) return false;
      const entra = profile as unknown as EntraProfile;
      const userId = entra.oid?.toLowerCase();
      const role = userId
        ? await entraGraphAuthoriser().authorise(userId)
        : null;
      const allowed =
        entra.tid?.toLowerCase() ===
          required("AUTH_MICROSOFT_ENTRA_ID_TENANT_ID").toLowerCase() &&
        Boolean(userId) &&
        Boolean(role);
      if (allowed)
        ensureActorUser({
          id: userId!,
          displayName: entra.name?.trim() || "DejaView user",
        });
      return allowed;
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "microsoft-entra-id" && profile) {
        const entra = profile as unknown as EntraProfile;
        token.userId = entra.oid.toLowerCase();
        token.groupIds = entra.groups ?? [];
        token.role = await entraGraphAuthoriser().authorise(token.userId);
        token.authorisedAt = Math.floor(Date.now() / 1000);
      } else if (
        typeof token.userId === "string" &&
        (typeof token.authorisedAt !== "number" ||
          Date.now() / 1000 - token.authorisedAt >= 5 * 60)
      ) {
        token.role = await entraGraphAuthoriser().authorise(token.userId);
        token.authorisedAt = Math.floor(Date.now() / 1000);
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = typeof token.userId === "string" ? token.userId : "";
      session.user.role =
        token.role === "viewer" ||
        token.role === "editor" ||
        token.role === "admin"
          ? token.role
          : null;
      return session;
    },
  },
});

export function actorFromSession(
  session: Session | null,
): ActorIdentity | null {
  const role = session?.user?.role;
  const id = session?.user?.id;
  if (!id || !role) return null;
  return {
    id,
    displayName: session.user.name?.trim() || "DejaView user",
    role,
  };
}
