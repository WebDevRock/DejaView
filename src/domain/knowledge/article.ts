export const STEP_TYPES = [
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

export type StepType = (typeof STEP_TYPES)[number];
export type ArticleStatus = "Draft" | "Published" | "Deprecated" | "Archived";
export type EdgeType = "next" | "branch" | "related";

export interface NamedApplication {
  key: string;
  name: string;
}

export interface NamedTag {
  slug: string;
  name: string;
}

export interface KnowledgeStep {
  id: string;
  articleId: string;
  stableKey: string;
  position: number;
  stepType: StepType;
  title: string | null;
  instruction: string;
  code: string | null;
  notes: string | null;
  bodyAstJson: string;
  bodyPlainText: string;
  createdAt: string;
  updatedAt: string;
}

export interface StepEdge {
  id: string;
  articleId: string;
  fromStepId: string;
  toStepId: string;
  edgeType: EdgeType;
  label: string | null;
  createdAt: string;
}

export interface KnowledgeArticle {
  id: string;
  stableKey: string;
  title: string;
  summary: string;
  problem: string;
  symptoms: string;
  resolutionSummary: string;
  status: ArticleStatus;
  version: number;
  useCount: number;
  lastUsedAt: string | null;
  createdByUserId: string;
  updatedByUserId: string;
  publishedByUserId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps: KnowledgeStep[];
  edges: StepEdge[];
  applications: NamedApplication[];
  tags: NamedTag[];
  sourceLabels: string[];
}

export interface AuthoringContext {
  actorId: string;
  now: string;
  id(): string;
}

export interface QuickDraftInput {
  problem: string;
  symptomsOrError?: string;
  whatFixedIt: string;
  applications?: string[];
  tags?: string[];
}

export interface StepInput {
  id?: string;
  stableKey?: string;
  position: number;
  stepType: StepType;
  title: string | null;
  instruction: string;
  code: string | null;
  notes: string | null;
}

export interface EdgeInput {
  id?: string;
  fromStepId: string;
  toStepId: string;
  edgeType: EdgeType;
  label: string | null;
}

export interface ArticleUpdateInput {
  version: number;
  title: string;
  summary: string;
  problem: string;
  symptoms: string;
  resolutionSummary: string;
  steps: StepInput[];
  edges: EdgeInput[];
  applications: string[];
  tags: string[];
}

export class KnowledgeArticleError extends Error {
  constructor(
    public readonly code:
      | "invalid_article"
      | "not_found"
      | "version_conflict"
      | "invalid_lifecycle",
    message: string,
  ) {
    super(message);
    this.name = "KnowledgeArticleError";
  }
}

function required(value: string, label: string): string {
  const clean = value.trim();
  if (!clean)
    throw new KnowledgeArticleError("invalid_article", `${label} is required`);
  return clean;
}

function slug(value: string): string {
  const result = value
    .trim()
    .toLocaleLowerCase("en-GB")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!result)
    throw new KnowledgeArticleError(
      "invalid_article",
      "Names must contain letters or numbers",
    );
  return result;
}

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => required(value, "Name"))
    .filter((value) => {
      const key = slug(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function projection(
  instruction: string,
  code: string | null,
): Pick<KnowledgeStep, "bodyAstJson" | "bodyPlainText"> {
  const bodyPlainText = [instruction.trim(), code?.trim()]
    .filter(Boolean)
    .join("\n\n");
  return {
    bodyPlainText,
    bodyAstJson: JSON.stringify({
      version: 1,
      type: "document",
      children: [{ type: "paragraph", text: bodyPlainText }],
    }),
  };
}

export function createQuickDraft(
  input: QuickDraftInput,
  context: AuthoringContext,
): KnowledgeArticle {
  const problem = required(input.problem, "Problem");
  const resolution = required(input.whatFixedIt, "What fixed it");
  const articleId = context.id();
  const stepId = context.id();
  const applications = uniqueNames(input.applications ?? []).map((name) => ({
    key: slug(name),
    name,
  }));
  const tags = uniqueNames(input.tags ?? []).map((name) => ({
    slug: slug(name),
    name,
  }));
  const stepProjection = projection(resolution, null);

  return {
    id: articleId,
    stableKey: `KB-${articleId.toUpperCase()}`,
    title: problem.slice(0, 120),
    summary: "",
    problem,
    symptoms: input.symptomsOrError?.trim() ?? "",
    resolutionSummary: resolution,
    status: "Draft",
    version: 1,
    useCount: 0,
    lastUsedAt: null,
    createdByUserId: context.actorId,
    updatedByUserId: context.actorId,
    publishedByUserId: null,
    publishedAt: null,
    createdAt: context.now,
    updatedAt: context.now,
    steps: [
      {
        id: stepId,
        articleId,
        stableKey: `step-${stepId}`,
        position: 0,
        stepType: "instruction",
        title: null,
        instruction: resolution,
        code: null,
        notes: null,
        ...stepProjection,
        createdAt: context.now,
        updatedAt: context.now,
      },
    ],
    edges: [],
    applications,
    tags,
    sourceLabels: ["Knowledge"],
  };
}

function validateSteps(steps: StepInput[]): void {
  if (!steps.length)
    throw new KnowledgeArticleError(
      "invalid_article",
      "At least one step is required",
    );
  const positions = [...steps]
    .map((step) => step.position)
    .sort((a, b) => a - b);
  if (positions.some((position, index) => position !== index))
    throw new KnowledgeArticleError(
      "invalid_article",
      "Step positions must be contiguous from zero",
    );
  const ids = steps.map((step) => step.id).filter(Boolean);
  if (new Set(ids).size !== ids.length)
    throw new KnowledgeArticleError(
      "invalid_article",
      "Step IDs must be unique",
    );
  const stableKeys = steps.map((step) => step.stableKey).filter(Boolean);
  if (new Set(stableKeys).size !== stableKeys.length)
    throw new KnowledgeArticleError(
      "invalid_article",
      "Step stable keys must be unique",
    );
}

function validateResolvedStepIdentities(steps: KnowledgeStep[]): void {
  const ids = steps.map((step) => step.id);
  if (new Set(ids).size !== ids.length)
    throw new KnowledgeArticleError(
      "invalid_article",
      "Step IDs must be unique",
    );
  const stableKeys = steps.map((step) => step.stableKey);
  if (new Set(stableKeys).size !== stableKeys.length)
    throw new KnowledgeArticleError(
      "invalid_article",
      "Step stable keys must be unique",
    );
}

function validateEdges(steps: KnowledgeStep[], edges: EdgeInput[]): void {
  const ids = edges.map((edge) => edge.id).filter(Boolean);
  if (new Set(ids).size !== ids.length)
    throw new KnowledgeArticleError(
      "invalid_article",
      "Edge IDs must be unique",
    );
  const tuples = edges.map(
    (edge) => `${edge.fromStepId}:${edge.toStepId}:${edge.edgeType}`,
  );
  if (new Set(tuples).size !== tuples.length)
    throw new KnowledgeArticleError(
      "invalid_article",
      "Edge connections and types must be unique",
    );
  const stepIds = new Set(steps.map((step) => step.id));
  for (const edge of edges) {
    if (!stepIds.has(edge.fromStepId) || !stepIds.has(edge.toStepId))
      throw new KnowledgeArticleError(
        "invalid_article",
        "Edges must connect steps in this article",
      );
    if (edge.fromStepId === edge.toStepId)
      throw new KnowledgeArticleError(
        "invalid_article",
        "A step cannot link to itself",
      );
  }
  const next = new Map<string, string[]>();
  for (const edge of edges.filter((item) => item.edgeType === "next")) {
    next.set(edge.fromStepId, [
      ...(next.get(edge.fromStepId) ?? []),
      edge.toStepId,
    ]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id))
      throw new KnowledgeArticleError(
        "invalid_article",
        "Next edges cannot contain a cycle",
      );
    if (visited.has(id)) return;
    visiting.add(id);
    for (const child of next.get(id) ?? []) visit(child);
    visiting.delete(id);
    visited.add(id);
  };
  for (const step of steps) visit(step.id);
}

function validateResolvedEdgeIdentities(edges: StepEdge[]): void {
  const ids = edges.map((edge) => edge.id);
  if (new Set(ids).size !== ids.length)
    throw new KnowledgeArticleError(
      "invalid_article",
      "Edge IDs must be unique",
    );
}

export function prepareArticleUpdate(
  existing: KnowledgeArticle,
  input: ArticleUpdateInput,
  context: AuthoringContext,
): KnowledgeArticle {
  if (input.version !== existing.version)
    throw new KnowledgeArticleError(
      "version_conflict",
      "Article version is stale",
    );
  validateSteps(input.steps);
  const priorSteps = new Map(existing.steps.map((step) => [step.id, step]));
  const steps = input.steps.map((step) => {
    const prior = step.id ? priorSteps.get(step.id) : undefined;
    const id = prior?.id ?? step.id ?? context.id();
    const instruction = required(step.instruction, "Step instruction");
    return {
      id,
      articleId: existing.id,
      stableKey: prior?.stableKey ?? step.stableKey ?? `step-${id}`,
      position: step.position,
      stepType: step.stepType,
      title: step.title?.trim() || null,
      instruction,
      code: step.code?.trim() || null,
      notes: step.notes?.trim() || null,
      ...projection(instruction, step.code),
      createdAt: prior?.createdAt ?? context.now,
      updatedAt: context.now,
    } satisfies KnowledgeStep;
  });
  validateResolvedStepIdentities(steps);
  validateEdges(steps, input.edges);
  const priorEdges = new Map(
    existing.edges.map((edge) => [
      `${edge.fromStepId}:${edge.toStepId}:${edge.edgeType}`,
      edge,
    ]),
  );
  const edges = input.edges.map((edge) => {
    const prior = priorEdges.get(
      `${edge.fromStepId}:${edge.toStepId}:${edge.edgeType}`,
    );
    return {
      id: prior?.id ?? edge.id ?? context.id(),
      articleId: existing.id,
      fromStepId: edge.fromStepId,
      toStepId: edge.toStepId,
      edgeType: edge.edgeType,
      label: edge.label?.trim() || null,
      createdAt: prior?.createdAt ?? context.now,
    } satisfies StepEdge;
  });
  validateResolvedEdgeIdentities(edges);
  return {
    ...existing,
    title: required(input.title, "Title"),
    summary: input.summary.trim(),
    problem: required(input.problem, "Problem"),
    symptoms: input.symptoms.trim(),
    resolutionSummary: input.resolutionSummary.trim(),
    version: existing.version + 1,
    updatedByUserId: context.actorId,
    updatedAt: context.now,
    steps,
    edges,
    applications: uniqueNames(input.applications).map((name) => ({
      key: slug(name),
      name,
    })),
    tags: uniqueNames(input.tags).map((name) => ({ slug: slug(name), name })),
  };
}

export function publishArticle(
  existing: KnowledgeArticle,
  expectedVersion: number,
  context: AuthoringContext,
): KnowledgeArticle {
  if (expectedVersion !== existing.version)
    throw new KnowledgeArticleError(
      "version_conflict",
      "Article version is stale",
    );
  if (existing.status !== "Draft")
    throw new KnowledgeArticleError(
      "invalid_lifecycle",
      "Only draft articles can be published",
    );
  return {
    ...existing,
    status: "Published",
    version: existing.version + 1,
    publishedByUserId: context.actorId,
    publishedAt: context.now,
    updatedByUserId: context.actorId,
    updatedAt: context.now,
  };
}
