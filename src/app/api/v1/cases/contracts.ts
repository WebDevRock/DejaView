import { z } from "zod";
const articleId = z.uuid().nullable().optional();
export const createCaseSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(10000),
    occurredAt: z.iso.datetime(),
    whatWasTried: z.string().max(10000),
    articleId,
  })
  .strict();
export const updateCaseSchema = createCaseSchema
  .extend({ expectedVersion: z.number().int().positive() })
  .strict();
export const resolveCaseSchema = z
  .object({
    resolutionNotes: z.string().trim().min(1).max(10000),
    expectedVersion: z.number().int().positive(),
  })
  .strict();
export const draftFromCaseSchema = z
  .object({ title: z.string().trim().max(200).optional() })
  .strict();
