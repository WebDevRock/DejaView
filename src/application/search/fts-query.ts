const OPERATOR = /^(?:AND|OR|NOT|NEAR)$/i;
const MAX_PARTS = 16;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
export interface CompiledFts5Query {
  expression: string | null;
  exactPhrases: string[];
  terms: string[];
}
/** Converts untrusted reader input to literal phrases/tokens; no FTS syntax survives. */
export function compileFts5Query(input: string): CompiledFts5Query {
  const exactPhrases: string[] = [];
  const terms: string[] = [];
  const ordered: string[] = [];
  const parts = input.match(/"[^"\r\n]{1,200}"|[\p{L}\p{N}_.\\/-]+/gu) ?? [];
  for (const part of parts) {
    if (ordered.length >= MAX_PARTS) break;
    if (part.startsWith('"')) {
      const clean = part
        .slice(1, -1)
        .replace(/[^\p{L}\p{N}_.:/\\ -]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (clean && !OPERATOR.test(clean)) {
        exactPhrases.push(clean);
        ordered.push(clean);
      }
      continue;
    }
    const term = part.replace(/^[-./\\]+|[-./\\]+$/g, "");
    if (term && !OPERATOR.test(term) && !/^NEAR\/\d+$/i.test(term)) {
      terms.push(term);
      ordered.push(term);
    }
  }
  return {
    expression: ordered.length ? ordered.map(quote).join(" OR ") : null,
    exactPhrases,
    terms,
  };
}
