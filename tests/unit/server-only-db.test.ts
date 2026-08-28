// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const runtimeModules = ["connection.ts", "migrator.ts", "seed.ts", "schema.ts"];

describe("runtime database module boundaries", () => {
  it.each(runtimeModules)("marks %s as server-only", (filename) => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/infrastructure/db", filename),
      "utf8",
    );

    expect(source).toMatch(/^import "server-only";/);
  });

  it("keeps runtime and composition modules independent of scripts", () => {
    const runtimeFiles = runtimeModules.map((filename) =>
      path.resolve(process.cwd(), "src/infrastructure/db", filename),
    );
    const compositionDirectory = path.resolve(process.cwd(), "src/composition");
    const compositionFiles = fs
      .readdirSync(compositionDirectory, {
        recursive: true,
        withFileTypes: true,
      })
      .filter((entry) => entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name));

    for (const filename of [...runtimeFiles, ...compositionFiles]) {
      const source = fs.readFileSync(filename, "utf8");
      expect(source, path.relative(process.cwd(), filename)).not.toMatch(
        /(?:import|export)[\s\S]*?from\s+["'][^"']*scripts(?:\/|["'])/,
      );
    }
  });

  it("keeps command-line entrypoints independent of guarded runtime modules", () => {
    for (const filename of ["migrate.ts", "seed.ts"]) {
      const source = fs.readFileSync(
        path.resolve(process.cwd(), "scripts", filename),
        "utf8",
      );
      expect(source).not.toMatch(
        /src\/infrastructure\/db\/(connection|migrator|seed|schema)/,
      );
      expect(source).toMatch(/scripts-safe/);
    }
  });
});
