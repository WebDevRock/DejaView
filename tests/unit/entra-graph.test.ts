// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  EntraGraphAuthoriser,
  parseEntraAccessConfiguration,
} from "@/infrastructure/auth/entra-graph";

const ids = {
  tenantId: "10000000-0000-4000-8000-000000000001",
  clientId: "10000000-0000-4000-8000-000000000002",
  clientSecret: "not-a-real-secret",
  readerGroupId: "10000000-0000-4000-8000-000000000003",
  editorGroupId: "10000000-0000-4000-8000-000000000004",
  adminGroupId: "10000000-0000-4000-8000-000000000005",
};

describe("Entra Graph authorisation", () => {
  it("rejects malformed or duplicated identity configuration", () => {
    expect(() =>
      parseEntraAccessConfiguration({ ...ids, readerGroupId: "reader" }),
    ).toThrow(/GUID/);
    expect(() =>
      parseEntraAccessConfiguration({
        ...ids,
        adminGroupId: ids.readerGroupId,
      }),
    ).toThrow(/distinct/);
  });

  it("checks transitive membership and account status", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "graph-token", expires_in: 3600 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accountEnabled: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [ids.editorGroupId] }), {
          status: 200,
        }),
      );
    const authoriser = new EntraGraphAuthoriser(
      parseEntraAccessConfiguration(ids),
      fetcher,
    );

    await expect(
      authoriser.authorise("20000000-0000-4000-8000-000000000001"),
    ).resolves.toBe("editor");
    expect(String(fetcher.mock.calls[1]![0])).toContain("accountEnabled");
    expect(String(fetcher.mock.calls[2]![0])).toContain("checkMemberGroups");
  });

  it("fails closed for disabled users and Graph errors", async () => {
    const disabled = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "graph-token", expires_in: 3600 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accountEnabled: false }), {
          status: 200,
        }),
      );
    await expect(
      new EntraGraphAuthoriser(
        parseEntraAccessConfiguration(ids),
        disabled,
      ).authorise("20000000-0000-4000-8000-000000000001"),
    ).resolves.toBeNull();

    const unavailable = vi
      .fn()
      .mockResolvedValue(new Response("no", { status: 503 }));
    await expect(
      new EntraGraphAuthoriser(
        parseEntraAccessConfiguration(ids),
        unavailable,
      ).authorise("20000000-0000-4000-8000-000000000001"),
    ).resolves.toBeNull();
  });
});
