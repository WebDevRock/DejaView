import type { SafeContentNode } from "../../../domain/sources/provider";

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
const children = (node: UnknownRecord): unknown[] =>
  Array.isArray(node.content) ? node.content : [];
type ParseBudget = { remainingText: number; remainingNodes: number };

function parseChildren(
  node: UnknownRecord,
  budget: ParseBudget,
  depth: number,
): SafeContentNode[] {
  const parsed: SafeContentNode[] = [];
  for (const child of children(node)) {
    if (budget.remainingNodes <= 0 || budget.remainingText <= 0) break;
    budget.remainingNodes--;
    parsed.push(...parseNode(child, budget, depth + 1));
  }
  return parsed;
}

function parseNode(
  value: unknown,
  budget: ParseBudget,
  depth = 0,
): SafeContentNode[] {
  if (depth > 64 || budget.remainingNodes < 0) return [];
  const node = record(value);
  if (!node || typeof node.type !== "string") return [];
  if (node.type === "text") {
    const text =
      typeof node.text === "string"
        ? node.text.slice(0, budget.remainingText)
        : "";
    budget.remainingText -= text.length;
    const marks = Array.isArray(node.marks) ? node.marks : [];
    let link: UnknownRecord | null = null;
    for (let index = 0; index < Math.min(marks.length, 50); index++) {
      const mark = record(marks[index]);
      if (mark?.type === "link") {
        link = mark;
        break;
      }
    }
    const attrs = record(link?.attrs);
    const href =
      typeof attrs?.href === "string" ? safeLink(attrs.href) : undefined;
    return [{ type: "text", text, ...(href ? { href } : {}) }];
  }
  if (node.type === "hardBreak") return [{ type: "hardBreak" }];
  if (node.type === "codeBlock") {
    const attrs = record(node.attrs);
    return [
      {
        type: "codeBlock",
        text: parseChildren(node, budget, depth).map(toText).join(""),
        ...(typeof attrs?.language === "string"
          ? { language: attrs.language.slice(0, 40) }
          : {}),
      },
    ];
  }
  const parsedChildren = parseChildren(node, budget, depth);
  if (node.type === "paragraph")
    return [{ type: "paragraph", children: parsedChildren }];
  if (node.type === "listItem")
    return [{ type: "listItem", children: parsedChildren }];
  if (node.type === "bulletList" || node.type === "orderedList")
    return [{ type: node.type, children: parsedChildren }];
  if (node.type === "heading") {
    const level = record(node.attrs)?.level;
    return [
      {
        type: "heading",
        level:
          typeof level === "number" && level >= 1 && level <= 6
            ? (level as 1 | 2 | 3 | 4 | 5 | 6)
            : 2,
        children: parsedChildren,
      },
    ];
  }
  return parsedChildren;
}
function safeLink(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
function toText(node: SafeContentNode): string {
  if (node.type === "text") return node.text;
  if (node.type === "hardBreak") return "\n";
  if (node.type === "codeBlock") return node.text;
  return node.children.map(toText).join("");
}
export function parseJiraAdf(value: unknown): SafeContentNode[] {
  const root = record(value);
  const budget = { remainingText: 20_000, remainingNodes: 2_000 };
  return root?.type === "doc"
    ? parseChildren(root, budget, -1)
    : typeof value === "string"
      ? [
          {
            type: "paragraph",
            children: [{ type: "text", text: value.slice(0, 20_000) }],
          },
        ]
      : [];
}
export function adfToPlainText(nodes: readonly SafeContentNode[]): string {
  return nodes
    .map(toText)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
