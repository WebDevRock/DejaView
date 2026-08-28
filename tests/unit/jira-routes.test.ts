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
});
