export type SupportCaseStatus = "Open" | "Resolved" | "Closed";

export interface SupportCase {
  id: string;
  stableKey: string;
  title: string;
  description: string;
  occurredAt: string;
  whatWasTried: string;
  resolutionNotes: string;
  articleId: string | null;
  status: SupportCaseStatus;
  version: number;
  createdByUserId: string;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class SupportCaseError extends Error {
  constructor(
    public readonly code:
      "invalid_case" | "not_found" | "version_conflict" | "invalid_lifecycle",
    message: string,
  ) {
    super(message);
    this.name = "SupportCaseError";
  }
}

const required = (value: string, label: string) => {
  const clean = value.trim();
  if (!clean)
    throw new SupportCaseError("invalid_case", `${label} is required`);
  return clean;
};
const date = (value: string, label: string) => {
  const clean = required(value, label);
  if (Number.isNaN(Date.parse(clean)))
    throw new SupportCaseError("invalid_case", `${label} must be a valid date`);
  return new Date(clean).toISOString();
};

export interface CaseContext {
  actorId: string;
  now: string;
  id(): string;
}
export interface CreateCaseInput {
  title: string;
  description: string;
  occurredAt: string;
  whatWasTried: string;
  articleId?: string | null;
}
export interface UpdateCaseInput extends CreateCaseInput {
  expectedVersion: number;
}

export function createSupportCase(
  input: CreateCaseInput,
  context: CaseContext,
): SupportCase {
  const id = context.id();
  return {
    id,
    stableKey: `CASE-${id.toUpperCase()}`,
    title: required(input.title, "Title"),
    description: required(input.description, "Description"),
    occurredAt: date(input.occurredAt, "Occurred at"),
    whatWasTried: input.whatWasTried.trim(),
    resolutionNotes: "",
    articleId: input.articleId ?? null,
    status: "Open",
    version: 1,
    createdByUserId: context.actorId,
    resolvedByUserId: null,
    resolvedAt: null,
    createdAt: context.now,
    updatedAt: context.now,
  };
}

export function updateSupportCase(
  existing: SupportCase,
  input: UpdateCaseInput,
  context: CaseContext,
): SupportCase {
  if (existing.status !== "Open")
    throw new SupportCaseError(
      "invalid_lifecycle",
      "Only open cases can be edited",
    );
  return {
    ...existing,
    title: required(input.title, "Title"),
    description: required(input.description, "Description"),
    occurredAt: date(input.occurredAt, "Occurred at"),
    whatWasTried: input.whatWasTried.trim(),
    articleId: input.articleId ?? null,
    version: existing.version + 1,
    updatedAt: context.now,
  };
}

export function resolveSupportCase(
  existing: SupportCase,
  resolutionNotes: string,
  context: CaseContext,
): SupportCase {
  if (existing.status !== "Open")
    throw new SupportCaseError(
      "invalid_lifecycle",
      "Only open cases can be resolved",
    );
  return {
    ...existing,
    status: "Resolved",
    version: existing.version + 1,
    resolutionNotes: required(resolutionNotes, "Resolution notes"),
    resolvedByUserId: context.actorId,
    resolvedAt: context.now,
    updatedAt: context.now,
  };
}
