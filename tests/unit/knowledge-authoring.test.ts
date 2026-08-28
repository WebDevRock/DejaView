import { describe, expect, it } from "vitest";
import {
  KnowledgeArticleError,
  createQuickDraft,
  prepareArticleUpdate,
  type StepInput,
} from "@/domain/knowledge/article";

const actorId = "00000000-0000-4000-8000-000000000001";
const now = "2026-08-28T10:00:00.000Z";
let sequence = 10;
const id = () =>
  `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
const toStepInput = (
  step: ReturnType<typeof createQuickDraft>["steps"][number],
): StepInput => ({
  id: step.id,
  stableKey: step.stableKey,
  position: step.position,
  stepType: step.stepType,
  title: step.title,
  instruction: step.instruction,
  code: step.code,
  notes: step.notes,
});

describe("knowledge article authoring", () => {
  it("uses the full UUID for collision-resistant article and step stable keys", () => {
    const values = [
      "aaaaaaaa-0000-4000-8000-000000000001",
      "aaaaaaaa-0000-4000-8000-000000000002",
    ];
    const article = createQuickDraft(
      { problem: "Problem", whatFixedIt: "Fix" },
      { actorId, now, id: () => values.shift()! },
    );

    expect(article.stableKey).toBe("KB-AAAAAAAA-0000-4000-8000-000000000001");
    expect(article.steps[0]!.stableKey).toBe(
      "step-aaaaaaaa-0000-4000-8000-000000000002",
    );
  });

  it.each([
    {
      name: "duplicate step IDs",
      mutate: (steps: StepInput[], edges: NonNullable<never>[]) => {
        steps[1]!.id = steps[0]!.id;
        return { steps, edges };
      },
    },
    {
      name: "duplicate step stable keys",
      mutate: (steps: StepInput[], edges: NonNullable<never>[]) => {
        steps[1]!.stableKey = steps[0]!.stableKey;
        return { steps, edges };
      },
    },
  ])("rejects $name before persistence", ({ mutate }) => {
    const draft = createQuickDraft(
      { problem: "Problem", whatFixedIt: "Fix" },
      { actorId, now, id },
    );
    const steps: StepInput[] = [
      toStepInput(draft.steps[0]!),
      {
        id: id(),
        stableKey: "second",
        position: 1,
        stepType: "check",
        title: null,
        instruction: "Check",
        code: null,
        notes: null,
      },
    ];
    const invalid = mutate(steps, []);

    expect(() =>
      prepareArticleUpdate(
        draft,
        {
          version: 1,
          title: draft.title,
          summary: "",
          problem: draft.problem,
          symptoms: "",
          resolutionSummary: "",
          steps: invalid.steps,
          edges: [],
          applications: [],
          tags: [],
        },
        { actorId, now, id },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_article" }));
  });

  it("rejects duplicate step stable keys after restoring an omitted existing key", () => {
    const draft = createQuickDraft(
      { problem: "Problem", whatFixedIt: "Fix" },
      { actorId, now, id },
    );

    expect(() =>
      prepareArticleUpdate(
        draft,
        {
          version: draft.version,
          title: draft.title,
          summary: "",
          problem: draft.problem,
          symptoms: "",
          resolutionSummary: "Fix",
          steps: [
            {
              ...toStepInput(draft.steps[0]!),
              stableKey: undefined,
            },
            {
              stableKey: draft.steps[0]!.stableKey,
              position: 1,
              stepType: "check",
              title: null,
              instruction: "Check",
              code: null,
              notes: null,
            },
          ],
          edges: [],
          applications: [],
          tags: [],
        },
        { actorId, now, id },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_article" }));
  });

  it.each([
    { name: "duplicate edge tuples", duplicateId: false },
    { name: "duplicate edge IDs", duplicateId: true },
  ])("rejects $name before persistence", ({ duplicateId }) => {
    const draft = createQuickDraft(
      { problem: "Problem", whatFixedIt: "Fix" },
      { actorId, now, id },
    );
    const secondId = id();
    const steps: StepInput[] = [
      toStepInput(draft.steps[0]!),
      {
        id: secondId,
        stableKey: "second",
        position: 1,
        stepType: "check",
        title: null,
        instruction: "Check",
        code: null,
        notes: null,
      },
    ];
    const edgeId = id();
    const edges = [
      {
        id: edgeId,
        fromStepId: steps[0]!.id!,
        toStepId: secondId,
        edgeType: "branch" as const,
        label: null,
      },
      {
        id: duplicateId ? edgeId : id(),
        fromStepId: duplicateId ? secondId : steps[0]!.id!,
        toStepId: duplicateId ? steps[0]!.id! : secondId,
        edgeType: "branch" as const,
        label: null,
      },
    ];

    expect(() =>
      prepareArticleUpdate(
        draft,
        {
          version: 1,
          title: draft.title,
          summary: "",
          problem: draft.problem,
          symptoms: "",
          resolutionSummary: "",
          steps,
          edges,
          applications: [],
          tags: [],
        },
        { actorId, now, id },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_article" }));
  });

  it("rejects duplicate edge IDs after restoring an omitted existing ID", () => {
    const draft = createQuickDraft(
      { problem: "Problem", whatFixedIt: "Fix" },
      { actorId, now, id },
    );
    const secondId = id();
    const steps: StepInput[] = [
      toStepInput(draft.steps[0]!),
      {
        id: secondId,
        stableKey: "second",
        position: 1,
        stepType: "check",
        title: null,
        instruction: "Check",
        code: null,
        notes: null,
      },
    ];
    const withEdge = prepareArticleUpdate(
      draft,
      {
        version: draft.version,
        title: draft.title,
        summary: "",
        problem: draft.problem,
        symptoms: "",
        resolutionSummary: "Fix",
        steps,
        edges: [
          {
            fromStepId: draft.steps[0]!.id,
            toStepId: secondId,
            edgeType: "branch",
            label: null,
          },
        ],
        applications: [],
        tags: [],
      },
      { actorId, now, id },
    );

    expect(() =>
      prepareArticleUpdate(
        withEdge,
        {
          version: withEdge.version,
          title: withEdge.title,
          summary: "",
          problem: withEdge.problem,
          symptoms: "",
          resolutionSummary: "Fix",
          steps: withEdge.steps.map(toStepInput),
          edges: [
            {
              fromStepId: withEdge.edges[0]!.fromStepId,
              toStepId: withEdge.edges[0]!.toStepId,
              edgeType: withEdge.edges[0]!.edgeType,
              label: null,
            },
            {
              id: withEdge.edges[0]!.id,
              fromStepId: secondId,
              toStepId: draft.steps[0]!.id,
              edgeType: "branch",
              label: null,
            },
          ],
          applications: [],
          tags: [],
        },
        { actorId, now, id },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_article" }));
  });

  it("turns the low-friction fields into a complete draft", () => {
    const article = createQuickDraft(
      {
        problem: "The payroll export fails",
        symptomsOrError: "SQLSTATE 42P01",
        whatFixedIt: "Restore the reporting view.",
        applications: ["Payroll"],
        tags: ["Database"],
      },
      { actorId, now, id },
    );

    expect(article).toMatchObject({
      title: "The payroll export fails",
      problem: "The payroll export fails",
      symptoms: "SQLSTATE 42P01",
      resolutionSummary: "Restore the reporting view.",
      status: "Draft",
      version: 1,
      applications: [{ key: "payroll", name: "Payroll" }],
      tags: [{ slug: "database", name: "Database" }],
    });
    expect(article.steps).toHaveLength(1);
    expect(article.steps[0]).toMatchObject({
      position: 0,
      stepType: "instruction",
      instruction: "Restore the reporting view.",
      bodyPlainText: "Restore the reporting view.",
    });
    expect(JSON.parse(article.steps[0]!.bodyAstJson)).toEqual({
      version: 1,
      type: "document",
      children: [{ type: "paragraph", text: "Restore the reporting view." }],
    });
  });

  it("supports every structured step type while retaining stable identities on reorder", () => {
    const draft = createQuickDraft(
      { problem: "Problem", whatFixedIt: "First" },
      { actorId, now, id },
    );
    const first = draft.steps[0]!;
    const types = [
      "instruction",
      "check",
      "decision",
      "sql",
      "powershell",
      "code",
      "url",
      "warning",
      "expected_result",
    ] as const;
    const steps = types.map((stepType, position) => ({
      id: position === 8 ? first.id : id(),
      stableKey: position === 8 ? first.stableKey : `step-${position}`,
      position,
      stepType,
      title: null,
      instruction: `${stepType} instruction`,
      code: ["sql", "powershell", "code"].includes(stepType) ? "example" : null,
      notes: null,
    }));

    const updated = prepareArticleUpdate(
      draft,
      {
        version: 1,
        title: "Updated",
        summary: "Summary",
        problem: "Problem",
        symptoms: "Symptom",
        resolutionSummary: "Resolution",
        steps,
        edges: [
          {
            fromStepId: steps[0]!.id,
            toStepId: steps[1]!.id,
            edgeType: "next",
            label: null,
          },
        ],
        applications: ["Payroll"],
        tags: ["Database"],
      },
      { actorId, now, id },
    );

    expect(updated.steps.map((step) => step.stepType)).toEqual(types);
    expect(updated.steps[8]!.id).toBe(first.id);
    expect(updated.version).toBe(2);
  });

  it("rejects stale versions and cycles in next edges", () => {
    const draft = createQuickDraft(
      { problem: "Problem", whatFixedIt: "First" },
      { actorId, now, id },
    );
    expect(() =>
      prepareArticleUpdate(
        draft,
        {
          version: 2,
          title: draft.title,
          summary: "",
          problem: draft.problem,
          symptoms: "",
          resolutionSummary: "",
          steps: draft.steps.map(toStepInput),
          edges: [],
          applications: [],
          tags: [],
        },
        { actorId, now, id },
      ),
    ).toThrowError(
      new KnowledgeArticleError("version_conflict", "Article version is stale"),
    );

    const secondId = id();
    const inputSteps: StepInput[] = [
      {
        id: draft.steps[0]!.id,
        stableKey: draft.steps[0]!.stableKey,
        position: 0,
        stepType: draft.steps[0]!.stepType,
        title: draft.steps[0]!.title,
        instruction: draft.steps[0]!.instruction,
        code: draft.steps[0]!.code,
        notes: draft.steps[0]!.notes,
      },
      {
        id: secondId,
        stableKey: "second",
        position: 1,
        stepType: "check" as const,
        title: null,
        instruction: "Second",
        code: null,
        notes: null,
      },
    ];
    expect(() =>
      prepareArticleUpdate(
        draft,
        {
          version: 1,
          title: draft.title,
          summary: "",
          problem: draft.problem,
          symptoms: "",
          resolutionSummary: "",
          steps: inputSteps,
          edges: [
            {
              fromStepId: draft.steps[0]!.id,
              toStepId: secondId,
              edgeType: "next",
              label: null,
            },
            {
              fromStepId: secondId,
              toStepId: draft.steps[0]!.id,
              edgeType: "next",
              label: null,
            },
          ],
          applications: [],
          tags: [],
        },
        { actorId, now, id },
      ),
    ).toThrow(/cycle/i);
  });
});
