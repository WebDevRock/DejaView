// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/health/route";

describe("GET /api/v1/health", () => {
  it("returns the versioned service health contract", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { service: "dejaview", status: "ok" },
      meta: { apiVersion: "v1" },
    });
  });
});
