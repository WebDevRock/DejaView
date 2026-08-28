import path from "node:path";
import { ESLint } from "eslint";

const eslint = new ESLint({ cwd: process.cwd() });
const cases = [
  {
    layer: "domain",
    file: "src/domain/example/check.ts",
    forbidden: [
      "../../application/example",
      "@/infrastructure/example",
      "@/app/example",
    ],
    allowed: "../model",
  },
  {
    layer: "application",
    file: "src/application/example/check.ts",
    forbidden: [
      "../../infrastructure/example",
      "@/presentation/example",
      "@/composition/root",
    ],
    allowed: "../../domain/model",
  },
];

for (const boundaryCase of cases) {
  for (const specifier of boundaryCase.forbidden) {
    const [result] = await eslint.lintText(
      `import value from ${JSON.stringify(specifier)};\nvoid value;\n`,
      {
        filePath: path.resolve(boundaryCase.file),
      },
    );
    if (
      !result?.messages.some(
        (message) => message.ruleId === "no-restricted-imports",
      )
    ) {
      throw new Error(
        `${boundaryCase.layer} boundary allowed forbidden import: ${specifier}`,
      );
    }
  }

  const [allowedResult] = await eslint.lintText(
    `import type { Allowed } from ${JSON.stringify(boundaryCase.allowed)};\nexport type Check = Allowed;\n`,
    { filePath: path.resolve(boundaryCase.file) },
  );
  const boundaryErrors =
    allowedResult?.messages.filter(
      (message) => message.ruleId === "no-restricted-imports",
    ) ?? [];
  if (boundaryErrors.length > 0) {
    throw new Error(
      `${boundaryCase.layer} boundary rejected allowed import: ${boundaryCase.allowed}`,
    );
  }
}

console.log("Boundary checks rejected forbidden relative and alias imports.");
