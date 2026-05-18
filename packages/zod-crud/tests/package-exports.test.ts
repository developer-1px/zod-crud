import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  exports: Record<string, { development?: string; import?: string; types?: string }>;
};

const publicVerbFiles = readdirSync(resolve(root, "src/verbs"))
  .filter((name) => name.endsWith(".ts"))
  .map((name) => name.slice(0, -".ts".length))
  .sort();

describe("package exports", () => {
  test("every export points at existing source, dist js, and dist type paths", () => {
    for (const [subpath, target] of Object.entries(packageJson.exports)) {
      expect(target.development, `${subpath} missing development condition`).toBeTruthy();
      expect(target.import, `${subpath} missing import condition`).toBeTruthy();
      expect(target.types, `${subpath} missing types condition`).toBeTruthy();
      expect(
        Object.keys(target)[0],
        `${subpath} must list the types condition first for TypeScript resolver stability`,
      ).toBe("types");

      expect(
        existsSync(resolve(root, target.development!.replace(/^\.\//, ""))),
        `${subpath} development target does not exist: ${target.development}`,
      ).toBe(true);

      const sourceFromImport = target.import!.replace(/^\.\//, "").replace(/^dist\//, "src/").replace(/\.js$/, ".ts");
      expect(
        existsSync(resolve(root, sourceFromImport)),
        `${subpath} import target has no matching source: ${target.import}`,
      ).toBe(true);

      const sourceFromTypes = target.types!.replace(/^\.\//, "").replace(/^dist\//, "src/").replace(/\.d\.ts$/, ".ts");
      expect(
        existsSync(resolve(root, sourceFromTypes)),
        `${subpath} types target has no matching source: ${target.types}`,
      ).toBe(true);
    }
  });

  test("all public verb modules are exposed as package subpaths", () => {
    for (const verb of publicVerbFiles) {
      expect(packageJson.exports, `missing export: ./verbs/${verb}`).toHaveProperty(`./verbs/${verb}`);
    }
  });
});
