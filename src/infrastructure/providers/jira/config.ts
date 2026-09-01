import "server-only";
import { z } from "zod";

const schema = z
  .object({
    sourceId: z.literal("jira"),
    sourceLabel: z.string().min(1).max(100),
    baseUrl: z.string().url(),
    email: z.string().email(),
    apiToken: z.string().min(1),
    projectKeys: z
      .array(z.string().regex(/^[A-Z][A-Z0-9_]{0,19}$/))
      .min(1)
      .max(50),
    projectColours: z
      .record(
        z.string().regex(/^[A-Z][A-Z0-9_]{0,19}$/),
        z.string().regex(/^#[0-9A-F]{6}$/),
      )
      .default({}),
    timeoutMs: z.number().int().min(100).max(30_000).default(5_000),
  })
  .strict()
  .superRefine((config, context) => {
    const colourKeys = Object.keys(config.projectColours);
    if (colourKeys.length > 50)
      context.addIssue({
        code: "too_big",
        origin: "object",
        maximum: 50,
        inclusive: true,
        path: ["projectColours"],
        message: "Too many Jira project colours",
      });
    for (const key of colourKeys)
      if (!config.projectKeys.includes(key))
        context.addIssue({
          code: "custom",
          path: ["projectColours", key],
          message: "Jira project colour key must be allow-listed",
        });
  });
export type JiraConfiguration = z.infer<typeof schema>;

export function parseJiraConfiguration(value: unknown): JiraConfiguration {
  const config = schema.parse(value);
  const url = new URL(config.baseUrl);
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Jira base URL must be an origin-only HTTPS URL");
  if (
    !hostname.endsWith(".atlassian.net") ||
    hostname === ".atlassian.net" ||
    /^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/.test(hostname)
  )
    throw new Error("Jira host is not approved");
  return { ...config, baseUrl: url.origin };
}

export function jiraConfigurationFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): JiraConfiguration | null {
  if (!environment.JIRA_BASE_URL) return null;
  return parseJiraConfiguration({
    sourceId: "jira",
    sourceLabel: environment.JIRA_SOURCE_LABEL ?? "Jira",
    baseUrl: environment.JIRA_BASE_URL,
    email: environment.JIRA_EMAIL,
    apiToken: environment.JIRA_API_TOKEN,
    projectKeys: (environment.JIRA_PROJECT_KEYS ?? "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean),
    projectColours: parseProjectColours(environment.JIRA_PROJECT_COLOURS),
    timeoutMs: environment.JIRA_TIMEOUT_MS
      ? Number(environment.JIRA_TIMEOUT_MS)
      : 5_000,
  });
}

function parseProjectColours(
  value: string | undefined,
): Record<string, string> {
  if (!value) return {};
  const entries = value.split(",").map((entry) => entry.trim());
  const colours: Record<string, string> = {};
  for (const entry of entries) {
    const separator = entry.indexOf(":");
    const key = separator < 0 ? entry : entry.slice(0, separator);
    const colour =
      separator < 0 ? "" : entry.slice(separator + 1).toUpperCase();
    if (Object.hasOwn(colours, key))
      throw new Error(`Duplicate Jira project colour: ${key}`);
    colours[key] = colour;
  }
  return colours;
}
