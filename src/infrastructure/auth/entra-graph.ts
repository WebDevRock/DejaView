import "server-only";
import { z } from "zod";
import { roleFromGroupIds } from "../../app/auth/access-control";
import type { ActorIdentity } from "../../domain/identity/actor";

const guid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const schema = z
  .object({
    tenantId: guid,
    clientId: guid,
    clientSecret: z.string().min(1),
    readerGroupId: guid,
    editorGroupId: guid,
    adminGroupId: guid,
  })
  .superRefine((value, context) => {
    const groups = [
      value.readerGroupId,
      value.editorGroupId,
      value.adminGroupId,
    ];
    if (new Set(groups).size !== groups.length)
      context.addIssue({
        code: "custom",
        message: "Group IDs must be distinct",
      });
  });

export type EntraAccessConfiguration = z.infer<typeof schema>;

export function parseEntraAccessConfiguration(
  value: unknown,
): EntraAccessConfiguration {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0]?.message ?? "Invalid Entra configuration";
      throw new Error(
        issue.includes("UUID") ? "Entra IDs must be GUID values" : issue,
      );
    }
    throw error;
  }
}

export function entraAccessConfigurationFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): EntraAccessConfiguration {
  return parseEntraAccessConfiguration({
    tenantId: environment.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID,
    clientId: environment.AUTH_MICROSOFT_ENTRA_ID_ID,
    clientSecret: environment.AUTH_MICROSOFT_ENTRA_ID_SECRET,
    readerGroupId: environment.DEJAVIEW_ENTRA_READER_GROUP_ID,
    editorGroupId: environment.DEJAVIEW_ENTRA_EDITOR_GROUP_ID,
    adminGroupId: environment.DEJAVIEW_ENTRA_ADMIN_GROUP_ID,
  });
}

type Fetcher = typeof fetch;

export class EntraGraphAuthoriser {
  private accessToken?: { value: string; expiresAt: number };

  constructor(
    private readonly config: EntraAccessConfiguration,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async authorise(userId: string): Promise<ActorIdentity["role"] | null> {
    const parsedUser = guid.safeParse(userId);
    if (!parsedUser.success) return null;
    try {
      const token = await this.token();
      const userUrl = new URL(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(parsedUser.data)}`,
      );
      userUrl.searchParams.set("$select", "accountEnabled");
      const userResponse = await this.fetcher(userUrl, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!userResponse.ok) return null;
      const user = z
        .object({ accountEnabled: z.boolean() })
        .parse(await userResponse.json());
      if (!user.accountEnabled) return null;

      const membershipResponse = await this.fetcher(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(parsedUser.data)}/checkMemberGroups`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ groupIds: Object.values(this.groups()) }),
        },
      );
      if (!membershipResponse.ok) return null;
      const membership = z
        .object({ value: z.array(guid).max(3) })
        .parse(await membershipResponse.json());
      return roleFromGroupIds(membership.value, this.groups());
    } catch {
      return null;
    }
  }

  private groups() {
    return {
      reader: this.config.readerGroupId,
      editor: this.config.editorGroupId,
      admin: this.config.adminGroupId,
    };
  }

  private async token(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && this.accessToken.expiresAt > now + 60_000)
      return this.accessToken.value;
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    });
    const response = await this.fetcher(
      `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      },
    );
    if (!response.ok) throw new Error("Microsoft Graph token request failed");
    const token = z
      .object({
        access_token: z.string().min(1),
        expires_in: z.number().positive(),
      })
      .parse(await response.json());
    this.accessToken = {
      value: token.access_token,
      expiresAt: now + token.expires_in * 1000,
    };
    return token.access_token;
  }
}

let authoriser: EntraGraphAuthoriser | undefined;
export function entraGraphAuthoriser(): EntraGraphAuthoriser {
  return (authoriser ??= new EntraGraphAuthoriser(
    entraAccessConfigurationFromEnvironment(),
  ));
}
