import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const frameworkAndDatabaseImports = {
  regex: "^(?:next(?:/|$)|better-sqlite3$|drizzle-orm(?:/|$))",
  message:
    "Domain and application layers must remain framework and database independent.",
};

function layerImportPattern(layers) {
  return {
    regex: `^(?:@/(?:${layers})(?:/|$)|(?:\\.\\./)+(?:${layers})(?:/|$))`,
    message:
      "Dependencies must point inwards through the domain and application layers.",
  };
}

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            frameworkAndDatabaseImports,
            layerImportPattern(
              "application|infrastructure|app|presentation|composition",
            ),
          ],
        },
      ],
    },
  },
  {
    files: ["src/application/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            frameworkAndDatabaseImports,
            layerImportPattern("infrastructure|app|presentation|composition"),
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "data/**",
  ]),
]);
