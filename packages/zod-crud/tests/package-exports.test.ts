import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  exports: Record<string, { import?: string; types?: string }>;
};

const publicVerbFiles = readdirSync(resolve(root, "src/verbs"))
  .filter((name) => name.endsWith(".ts"))
  .map((name) => name.slice(0, -".ts".length))
  .sort();

describe("package exports", () => {
  test("every export points at existing source, dist js, and dist type paths", () => {
    for (const [subpath, target] of Object.entries(packageJson.exports)) {
      expect(
        Object.keys(target),
        `${subpath} must expose exactly the supported export conditions`,
      ).toEqual(["types", "import"]);
      expect(target.import, `${subpath} missing import condition`).toBeTruthy();
      expect(target.types, `${subpath} missing types condition`).toBeTruthy();
      expect(target.import, `${subpath} import target must point to built ESM`).toMatch(/^\.\/dist\/.+\.js$/);
      expect(target.types, `${subpath} types target must point to built declarations`).toMatch(/^\.\/dist\/.+\.d\.ts$/);

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

  test("package subpaths are limited to root, react, and public verbs", () => {
    const expectedExports = [".", "./react", ...publicVerbFiles.map((verb) => `./verbs/${verb}`)].sort();

    expect(Object.keys(packageJson.exports).sort()).toEqual(expectedExports);
  });

  test("root entrypoint stays headless and does not re-export React modules", () => {
    const rootSource = readFileSync(resolve(root, "src/index.ts"), "utf8");

    expect(rootSource).not.toMatch(/from "\.\/react\.js"/);
    expect(rootSource).not.toMatch(/from "\.\/hooks\//);
    expect(rootSource).not.toMatch(/from "\.\/sidecars\//);
    expect(rootSource).not.toMatch(/from "react"/);
  });
});
