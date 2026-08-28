const PROJECT_KEY = /^[A-Z][A-Z0-9_]{0,19}$/;

function literal(value: string): string {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\u0000-\u001f\u007f]/g, " ")}"`;
}

export function buildJiraJql(
  text: string,
  projects: readonly string[],
  dates: { dateFrom?: string; dateTo?: string } = {},
): string {
  if (!projects.length || projects.some((key) => !PROJECT_KEY.test(key)))
    throw new Error("At least one valid Jira project key is required");
  const projectClause = `project IN (${projects.map(literal).join(", ")})`;
  const cleanText = text.trim().replace(/\s+/g, " ").slice(0, 500);
  const clauses = [projectClause];
  if (cleanText) clauses.push(`text ~ ${literal(cleanText)}`);
  if (dates.dateFrom)
    clauses.push(`updated >= ${literal(jiraUtcDate(dates.dateFrom))}`);
  if (dates.dateTo)
    clauses.push(`updated <= ${literal(jiraUtcDate(dates.dateTo))}`);
  return `${clauses.join(" AND ")} ORDER BY updated DESC`;
}

function jiraUtcDate(value: string): string {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) throw new Error("Invalid UTC date filter");
  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second = "0",
    fraction = "0",
    zone = "",
  ] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const [y, m, d, h, min, s] = parts as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const milliseconds = Number(fraction.slice(0, 3).padEnd(3, "0"));
  const local = new Date(Date.UTC(y, m - 1, d, h, min, s, milliseconds));
  const validCalendar =
    local.getUTCFullYear() === y &&
    local.getUTCMonth() === m - 1 &&
    local.getUTCDate() === d &&
    local.getUTCHours() === h &&
    local.getUTCMinutes() === min &&
    local.getUTCSeconds() === s;
  const validZone =
    zone === "Z" ||
    (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4, 6)) <= 59);
  const date = new Date(value);
  if (!validCalendar || !validZone || !Number.isFinite(date.getTime()))
    throw new Error("Invalid UTC date filter");
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export function assertIssueKey(
  key: string,
  projects: readonly string[],
): string {
  if (
    !/^[A-Z][A-Z0-9_]{0,19}-[1-9][0-9]*$/.test(key) ||
    !projects.includes(key.split("-")[0]!)
  )
    throw new Error("Invalid Jira issue key");
  return key;
}
