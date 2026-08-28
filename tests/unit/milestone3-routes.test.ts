// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetComposition } from "@/composition/root";
import { LOCAL_ACTOR } from "@/app/auth/local-actor";
import { GET as listCases, POST as createCase } from "@/app/api/v1/cases/route";
import {
  GET as getCase,
  PATCH as patchCase,
} from "@/app/api/v1/cases/[id]/route";
import { POST as draftCase } from "@/app/api/v1/cases/[id]/draft-article/route";
import { POST as resolveCase } from "@/app/api/v1/cases/[id]/resolve/route";
import {
  GET as feedbackHistory,
  POST as feedback,
} from "@/app/api/v1/articles/[id]/feedback/route";
import { GET as related } from "@/app/api/v1/articles/[id]/related/route";
import { POST as quickCreate } from "@/app/api/v1/articles/quick/route";
let directory = "";
const request = (url: string, method: string, body: unknown) =>
  new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      origin: new URL(url).origin,
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "dejaview-m3-api-"));
  process.env.DATABASE_URL = path.join(directory, "api.sqlite");
  process.env.DEJAVIEW_LOCAL_AUTH = "true";
  resetComposition();
});
afterEach(() => {
  LOCAL_ACTOR.role = "editor";
  resetComposition();
  delete process.env.DATABASE_URL;
  delete process.env.DEJAVIEW_LOCAL_AUTH;
  fs.rmSync(directory, { recursive: true, force: true });
});
describe("milestone 3 routes", () => {
  it("creates and resolves support cases", async () => {
    const response = await createCase(
      request("http://localhost/api/v1/cases", "POST", {
        title: "Failure",
        description: "E42",
        occurredAt: "2026-08-28T10:00:00Z",
        whatWasTried: "Restart",
      }),
    );
    expect(response.status).toBe(201);
    const created = (await response.json()).data;
    expect((await (await listCases()).json()).data).toHaveLength(1);
    const resolved = await resolveCase(
      request("http://localhost", "POST", {
        resolutionNotes: "Fixed",
        expectedVersion: created.version,
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect((await resolved.json()).data.status).toBe("Resolved");
  });
  it("gets, patches and drafts a case with domain errors", async () => {
    const created = (
      await (
        await createCase(
          request("http://localhost/api/v1/cases", "POST", {
            title: "Failure",
            description: "E42",
            occurredAt: "2026-08-28T10:00:00Z",
            whatWasTried: "Restart",
          }),
        )
      ).json()
    ).data;
    const context = { params: Promise.resolve({ id: created.id }) };
    expect(
      (await (await getCase(new Request("http://localhost"), context)).json())
        .data.version,
    ).toBe(1);
    const input = {
      title: "Changed",
      description: "E42",
      occurredAt: "2026-08-28T10:00:00.000Z",
      whatWasTried: "Restart",
      articleId: null,
      expectedVersion: 1,
    };
    const patched = await patchCase(
      request("http://localhost", "PATCH", input),
      context,
    );
    expect((await patched.json()).data.version).toBe(2);
    expect(
      (await patchCase(request("http://localhost", "PATCH", input), context))
        .status,
    ).toBe(409);
    const invalid = await createCase(
      request("http://localhost", "POST", {
        ...input,
        articleId: "00000000-0000-4000-8000-000000000099",
        expectedVersion: undefined,
      }),
    );
    expect(invalid.status).toBe(404);
    const drafted = await draftCase(
      request("http://localhost", "POST", {}),
      context,
    );
    const mapped = (await drafted.json()).data;
    expect(mapped.supportCase.articleId).toBe(mapped.article.id);
  });

  it("records feedback and returns related articles", async () => {
    const first = (
      await (
        await quickCreate(
          request("http://localhost", "POST", {
            problem: "Payroll export",
            whatFixedIt: "Fix",
            applications: ["Payroll"],
          }),
        )
      ).json()
    ).data;
    const feedbackResponse = await feedback(
      request("http://localhost", "POST", { outcome: "yes" }),
      { params: Promise.resolve({ id: first.id }) },
    );
    expect((await feedbackResponse.json()).data.article.useCount).toBe(1);
    const noResponse = await feedback(
      request("http://localhost", "POST", {
        outcome: "no",
        differenceNote: "Different schema",
      }),
      { params: Promise.resolve({ id: first.id }) },
    );
    expect((await noResponse.json()).data.article.useCount).toBe(1);
    const history = await feedbackHistory(new Request("http://localhost"), {
      params: Promise.resolve({ id: first.id }),
    });
    expect((await history.json()).data).toHaveLength(2);
    expect(
      (
        await (
          await related(new Request("http://localhost"), {
            params: Promise.resolve({ id: first.id }),
          })
        ).json()
      ).data,
    ).toEqual([]);
  });
  it("allows reader feedback but rejects missing identity and cross-origin requests", async () => {
    const article = (
      await (
        await quickCreate(
          request("http://localhost", "POST", {
            problem: "Reader feedback",
            whatFixedIt: "Fix",
          }),
        )
      ).json()
    ).data;
    const context = { params: Promise.resolve({ id: article.id }) };
    LOCAL_ACTOR.role = "viewer";
    expect(
      (
        await feedback(
          request("http://localhost", "POST", { outcome: "no" }),
          context,
        )
      ).status,
    ).toBe(201);
    process.env.DEJAVIEW_LOCAL_AUTH = "false";
    expect(
      (
        await feedback(
          request("http://localhost", "POST", { outcome: "no" }),
          context,
        )
      ).status,
    ).toBe(401);
    process.env.DEJAVIEW_LOCAL_AUTH = "true";
    const crossOrigin = new Request("http://localhost", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
      },
      body: JSON.stringify({ outcome: "no" }),
    });
    expect((await feedback(crossOrigin, context)).status).toBe(403);
  });
});
