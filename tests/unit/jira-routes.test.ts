// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { POST as promote } from "@/app/api/v1/providers/jira/issues/[key]/promote/route";

afterEach(() => {
  delete process.env.DEJAVIEW_LOCAL_AUTH;
});
const context = { params: Promise.resolve({ key: "SUP-1" }) };

describe("Jira promotion route authorisation", () => {
  it("requires authentication before contacting Jira", async () => {
    const response = await promote(
      new Request(
        "http://localhost/api/v1/providers/jira/issues/SUP-1/promote",
        { method: "POST", headers: { origin: "http://localhost" } },
      ),
      context,
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("unauthenticated");
  });
  it("rejects cross-origin promotion", async () => {
    process.env.DEJAVIEW_LOCAL_AUTH = "true";
    const response = await promote(
      new Request(
        "http://localhost/api/v1/providers/jira/issues/SUP-1/promote",
        { method: "POST", headers: { origin: "https://attacker.example" } },
      ),
      context,
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("cross_origin");
  });

  it("requires explicit same-origin browser evidence before promotion", async () => {
    process.env.DEJAVIEW_LOCAL_AUTH = "true";
    const response = await promote(
      new Request(
        "http://localhost/api/v1/providers/jira/issues/SUP-1/promote",
        { method: "POST" },
      ),
      context,
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("cross_origin");
  });

  it.each([
    { comments: [{ id: "abc", mapping: "context" }] },
    { comments: [{ id: "1", mapping: "other" }] },
    {
      comments: [
        { id: "1", mapping: "context" },
        { id: "1", mapping: "step" },
      ],
    },
    {
      comments: Array.from({ length: 21 }, (_, index) => ({
        id: String(index + 1),
        mapping: "context",
      })),
    },
    { comments: [], extra: true },
  ])("strictly rejects an invalid comment selection %#", async (body) => {
    process.env.DEJAVIEW_LOCAL_AUTH = "true";
    const response = await promote(
      new Request(
        "http://localhost/api/v1/providers/jira/issues/SUP-1/promote",
        {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      ),
      context,
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
  });

  it("accepts a bodyless legacy promotion request", async () => {
    process.env.DEJAVIEW_LOCAL_AUTH = "true";
    const response = await promote(
      new Request(
        "http://localhost/api/v1/providers/jira/issues/SUP-1/promote",
        { method: "POST", headers: { origin: "http://localhost" } },
      ),
      context,
    );
    expect(response.status).not.toBe(400);
  });

  it("rejects malformed non-empty JSON", async () => {
    process.env.DEJAVIEW_LOCAL_AUTH = "true";
    const response = await promote(
      new Request(
        "http://localhost/api/v1/providers/jira/issues/SUP-1/promote",
        {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
          },
          body: "{not-json",
        },
      ),
      context,
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
  });
});
