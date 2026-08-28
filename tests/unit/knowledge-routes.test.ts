// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetComposition } from "@/composition/root";
import { GET as listArticles } from "@/app/api/v1/articles/route";
import { POST as quickCreate } from "@/app/api/v1/articles/quick/route";
import {
  GET as getArticle,
  PATCH as updateArticle,
} from "@/app/api/v1/articles/[id]/route";
import { POST as publishArticle } from "@/app/api/v1/articles/[id]/publish/route";

let directory = "";

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "dejaview-api-"));
  process.env.DATABASE_URL = path.join(directory, "api.sqlite");
  process.env.DEJAVIEW_LOCAL_AUTH = "true";
  resetComposition();
});

afterEach(() => {
  resetComposition();
  delete process.env.DATABASE_URL;
  delete process.env.DEJAVIEW_LOCAL_AUTH;
  fs.rmSync(directory, { recursive: true, force: true });
});

const jsonRequest = (url: string, method: string, body: unknown) =>
  new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      origin: new URL(url).origin,
    },
    body: JSON.stringify(body),
  });

describe("/api/v1 article routes", () => {
  it("rejects mutations without an authenticated actor", async () => {
    delete process.env.DEJAVIEW_LOCAL_AUTH;

    const response = await quickCreate(
      jsonRequest("http://localhost/api/v1/articles/quick", "POST", {}),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("unauthenticated");
  });

  it("rejects cross-origin browser mutations", async () => {
    const request = jsonRequest(
      "http://localhost/api/v1/articles/quick",
      "POST",
      { problem: "Problem", whatFixedIt: "Fix" },
    );
    request.headers.set("origin", "https://attacker.example");

    const response = await quickCreate(request);

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("cross_origin");
  });

  it("does not permit local authentication in production", async () => {
    const priorNodeEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
      writable: true,
      enumerable: true,
    });
    try {
      const response = await quickCreate(
        jsonRequest("http://localhost/api/v1/articles/quick", "POST", {
          problem: "Problem",
          whatFixedIt: "Fix",
        }),
      );
      expect(response.status).toBe(401);
    } finally {
      Object.defineProperty(process.env, "NODE_ENV", {
        value: priorNodeEnv,
        configurable: true,
        writable: true,
        enumerable: true,
      });
    }
  });

  it("returns 400 for non-canonical article route IDs", async () => {
    const response = await getArticle(new Request("http://localhost"), {
      params: Promise.resolve({ id: "NOT-A-UUID" }),
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
  });
  it("quick creates, lists, gets, updates and publishes an article", async () => {
    const createdResponse = await quickCreate(
      jsonRequest("http://localhost/api/v1/articles/quick", "POST", {
        problem: "Payroll export fails",
        symptomsOrError: "E42",
        whatFixedIt: "Restore the view",
        applications: ["Payroll"],
        tags: ["Database"],
      }),
    );
    expect(createdResponse.status).toBe(201);
    const createdBody = await createdResponse.json();
    const created = createdBody.data;

    expect((await (await listArticles()).json()).data).toHaveLength(1);
    expect(
      (
        await (
          await getArticle(new Request("http://localhost"), {
            params: Promise.resolve({ id: created.id }),
          })
        ).json()
      ).data.id,
    ).toBe(created.id);

    const updateResponse = await updateArticle(
      jsonRequest("http://localhost", "PATCH", {
        version: created.version,
        title: "Repair payroll export",
        summary: "Known fix",
        problem: created.problem,
        symptoms: created.symptoms,
        resolutionSummary: "Restore the view",
        steps: created.steps,
        edges: [],
        applications: ["Payroll"],
        tags: ["Database"],
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(updateResponse.status).toBe(200);
    const updated = (await updateResponse.json()).data;

    const publishResponse = await publishArticle(
      jsonRequest("http://localhost", "POST", { version: updated.version }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(publishResponse.status).toBe(200);
    expect((await publishResponse.json()).data).toMatchObject({
      status: "Published",
      version: 3,
    });
  });

  it("maps validation, missing records and stale versions to the v1 error contract", async () => {
    const invalid = await quickCreate(
      jsonRequest("http://localhost", "POST", { problem: "", whatFixedIt: "" }),
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toMatchObject({
      code: "invalid_request",
      requestId: expect.any(String),
    });

    const missing = await getArticle(new Request("http://localhost"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000099" }),
    });
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("not_found");
  });

  it("returns invalid_article before persistence for duplicate step stable keys", async () => {
    const createdResponse = await quickCreate(
      jsonRequest("http://localhost/api/v1/articles/quick", "POST", {
        problem: "Problem",
        whatFixedIt: "Fix",
      }),
    );
    const created = (await createdResponse.json()).data;
    const duplicateId = "00000000-0000-4000-8000-000000000088";

    const response = await updateArticle(
      jsonRequest("http://localhost/api/v1/articles/example", "PATCH", {
        version: created.version,
        title: created.title,
        summary: "",
        problem: created.problem,
        symptoms: "",
        resolutionSummary: "Fix",
        steps: [
          created.steps[0],
          {
            ...created.steps[0],
            id: duplicateId,
            position: 1,
          },
        ],
        edges: [],
        applications: [],
        tags: [],
      }),
      { params: Promise.resolve({ id: created.id }) },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_article");
    const persisted = await getArticle(new Request("http://localhost"), {
      params: Promise.resolve({ id: created.id }),
    });
    expect((await persisted.json()).data).toMatchObject({
      version: 1,
      steps: [expect.objectContaining({ instruction: "Fix" })],
    });
  });

  it("rejects a restored duplicate step stable key without changing the article", async () => {
    const createdResponse = await quickCreate(
      jsonRequest("http://localhost/api/v1/articles/quick", "POST", {
        problem: "Problem",
        whatFixedIt: "Fix",
      }),
    );
    const created = (await createdResponse.json()).data;

    const response = await updateArticle(
      jsonRequest("http://localhost/api/v1/articles/example", "PATCH", {
        version: created.version,
        title: created.title,
        summary: "",
        problem: created.problem,
        symptoms: "",
        resolutionSummary: "Fix",
        steps: [
          { ...created.steps[0], stableKey: undefined },
          {
            ...created.steps[0],
            id: undefined,
            position: 1,
          },
        ],
        edges: [],
        applications: [],
        tags: [],
      }),
      { params: Promise.resolve({ id: created.id }) },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_article");
    const persisted = await getArticle(new Request("http://localhost"), {
      params: Promise.resolve({ id: created.id }),
    });
    expect((await persisted.json()).data).toEqual(created);
  });

  it("rejects a restored duplicate edge ID without changing the article", async () => {
    const createdResponse = await quickCreate(
      jsonRequest("http://localhost/api/v1/articles/quick", "POST", {
        problem: "Problem",
        whatFixedIt: "Fix",
      }),
    );
    const created = (await createdResponse.json()).data;
    const secondId = "00000000-0000-4000-8000-000000000087";
    const firstUpdateResponse = await updateArticle(
      jsonRequest("http://localhost/api/v1/articles/example", "PATCH", {
        version: created.version,
        title: created.title,
        summary: "",
        problem: created.problem,
        symptoms: "",
        resolutionSummary: "Fix",
        steps: [
          created.steps[0],
          {
            ...created.steps[0],
            id: secondId,
            stableKey: "second",
            position: 1,
            instruction: "Check",
          },
        ],
        edges: [
          {
            fromStepId: created.steps[0].id,
            toStepId: secondId,
            edgeType: "branch",
            label: null,
          },
        ],
        applications: [],
        tags: [],
      }),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(firstUpdateResponse.status).toBe(200);
    const withEdge = (await firstUpdateResponse.json()).data;

    const response = await updateArticle(
      jsonRequest("http://localhost/api/v1/articles/example", "PATCH", {
        version: withEdge.version,
        title: withEdge.title,
        summary: "",
        problem: withEdge.problem,
        symptoms: "",
        resolutionSummary: "Fix",
        steps: withEdge.steps,
        edges: [
          {
            ...withEdge.edges[0],
            id: undefined,
          },
          {
            id: withEdge.edges[0].id,
            fromStepId: secondId,
            toStepId: created.steps[0].id,
            edgeType: "branch",
            label: null,
          },
        ],
        applications: [],
        tags: [],
      }),
      { params: Promise.resolve({ id: created.id }) },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_article");
    const persisted = await getArticle(new Request("http://localhost"), {
      params: Promise.resolve({ id: created.id }),
    });
    expect((await persisted.json()).data).toEqual(withEdge);
  });
});
