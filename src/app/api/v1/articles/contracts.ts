import { z } from "zod";
import { STEP_TYPES } from "@/domain/knowledge/article";

const name = z.string().trim().min(1).max(80);
export const quickCreateSchema = z
  .object({
    problem: z.string().trim().min(1).max(5000),
    symptomsOrError: z.string().trim().max(5000).optional(),
    whatFixedIt: z.string().trim().min(1).max(10000),
    applications: z.array(name).max(30).optional(),
    tags: z.array(name).max(30).optional(),
  })
  .strict();

const stepSchema = z
  .object({
    id: z.uuid().optional(),
    stableKey: z.string().trim().min(1).max(100).optional(),
    position: z.number().int().nonnegative(),
    stepType: z.enum(STEP_TYPES),
    title: z.string().trim().max(200).nullable(),
    instruction: z.string().trim().min(1).max(20000),
    code: z.string().max(50000).nullable(),
    notes: z.string().max(10000).nullable(),
  })
  .strip();
const edgeSchema = z
  .object({
    id: z.uuid().optional(),
    fromStepId: z.uuid(),
    toStepId: z.uuid(),
    edgeType: z.enum(["next", "branch", "related"]),
    label: z.string().trim().max(200).nullable(),
  })
  .strip();
export const articleUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    title: z.string().trim().min(1).max(200),
    summary: z.string().max(5000),
    problem: z.string().trim().min(1).max(10000),
    symptoms: z.string().max(10000),
    resolutionSummary: z.string().max(10000),
    steps: z.array(stepSchema).min(1).max(100),
    edges: z.array(edgeSchema).max(200),
    applications: z.array(name).max(30),
    tags: z.array(name).max(30),
  })
  .strict();
export const publishSchema = z
  .object({ version: z.number().int().positive() })
  .strict();
