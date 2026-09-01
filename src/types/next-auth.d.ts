import type { DefaultSession } from "next-auth";
import type { ActorIdentity } from "../domain/identity/actor";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: ActorIdentity["role"] | null;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId?: string;
    groupIds?: string[];
    authorisedAt?: number;
    role?: ActorIdentity["role"] | null;
  }
}
