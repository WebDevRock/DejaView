// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  accessDecision,
  roleFromGroupIds,
  type AccessSession,
} from "@/app/auth/access-control";

const session = (role: AccessSession["role"]): AccessSession => ({
  userId: "00000000-0000-4000-8000-000000000002",
  displayName: "Authenticated User",
  role,
});

describe("application access control", () => {
  it("allows only authentication endpoints without a session", () => {
    expect(accessDecision("/api/auth/signin", false, null)).toBe("allow");
    expect(
      accessDecision("/api/auth/callback/microsoft-entra-id", false, null),
    ).toBe("allow");
    expect(accessDecision("/auth/signin", false, null)).toBe("allow");
    expect(accessDecision("/auth/forbidden", false, session(null))).toBe(
      "allow",
    );
    expect(accessDecision("/api/v1/health", true, null)).toBe(
      "api-unauthenticated",
    );
    expect(accessDecision("/api/v1/search", true, null)).toBe(
      "api-unauthenticated",
    );
    expect(accessDecision("/_next/static/chunks/app.js", false, null)).toBe(
      "page-unauthenticated",
    );
    expect(accessDecision("/search", false, null)).toBe("page-unauthenticated");
  });

  it("rejects signed-in users without an authorised AD group", () => {
    expect(accessDecision("/search", false, session(null))).toBe("forbidden");
    expect(accessDecision("/api/v1/search", true, session(null))).toBe(
      "forbidden",
    );
  });

  it("allows viewers, editors and administrators through the global gate", () => {
    for (const role of ["viewer", "editor", "admin"] as const)
      expect(accessDecision("/search", false, session(role))).toBe("allow");
  });

  it("maps the highest matching AD group to the application role", () => {
    const groups = {
      reader: "10000000-0000-4000-8000-000000000001",
      editor: "10000000-0000-4000-8000-000000000002",
      admin: "10000000-0000-4000-8000-000000000003",
    };
    expect(roleFromGroupIds([groups.reader], groups)).toBe("viewer");
    expect(roleFromGroupIds([groups.reader, groups.editor], groups)).toBe(
      "editor",
    );
    expect(roleFromGroupIds([groups.reader, groups.admin], groups)).toBe(
      "admin",
    );
    expect(roleFromGroupIds([], groups)).toBeNull();
  });
});
