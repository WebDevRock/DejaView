// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import {
  AuthorisationError,
  resolveFeedbackActor,
  resolveMutationActor,
  type IdentityProvider,
} from "@/app/auth/authorisation";

const request = new Request("https://dejaview.example/api/v1/articles/quick", {
  method: "POST",
  headers: { origin: "https://dejaview.example" },
});

afterEach(() => {
  delete process.env.DEJAVIEW_LOCAL_AUTH;
});

describe("mutation authorisation", () => {
  it("allows an authenticated reader to submit same-origin feedback", async () => {
    const provider: IdentityProvider = {
      resolve: async () => ({
        id: "00000000-0000-4000-8000-000000000002",
        displayName: "Reader",
        role: "viewer",
      }),
    };
    await expect(
      resolveFeedbackActor(request, provider),
    ).resolves.toMatchObject({
      role: "viewer",
    });
  });

  it("still rejects missing identity and cross-origin feedback", async () => {
    await expect(
      resolveFeedbackActor(request, { resolve: async () => null }),
    ).rejects.toMatchObject({ code: "unauthenticated", status: 401 });
    await expect(
      resolveFeedbackActor(
        new Request(request.url, {
          method: "POST",
          headers: { origin: "https://attacker.example" },
        }),
        { resolve: async () => null },
      ),
    ).rejects.toMatchObject({ code: "cross_origin", status: 403 });
  });
  it("uses the forwarded browser-facing origin behind the application server", async () => {
    const provider: IdentityProvider = {
      resolve: async () => ({
        id: "00000000-0000-4000-8000-000000000002",
        displayName: "Author",
        role: "editor",
      }),
    };
    const forwardedRequest = new Request(
      "http://localhost:3000/api/v1/articles/quick",
      {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:3000",
          host: "127.0.0.1:3000",
        },
      },
    );

    await expect(
      resolveMutationActor(forwardedRequest, provider),
    ).resolves.toMatchObject({ role: "editor" });
  });

  it("rejects an authenticated actor without an editor or admin role", async () => {
    const provider: IdentityProvider = {
      resolve: async () => ({
        id: "00000000-0000-4000-8000-000000000002",
        displayName: "Reader",
        role: "viewer",
      }),
    };

    await expect(resolveMutationActor(request, provider)).rejects.toEqual(
      new AuthorisationError("forbidden", "Editor access is required", 403),
    );
  });

  it.each(["editor", "admin"] as const)(
    "allows an authenticated %s actor",
    async (role) => {
      const provider: IdentityProvider = {
        resolve: async () => ({
          id: "00000000-0000-4000-8000-000000000002",
          displayName: "Author",
          role,
        }),
      };

      await expect(
        resolveMutationActor(request, provider),
      ).resolves.toMatchObject({
        role,
      });
    },
  );
});
