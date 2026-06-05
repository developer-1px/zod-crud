import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as rootApi from "zod-crud";
import * as reactApi from "zod-crud/react";

const packageRoot = resolve(__dirname, "..", "..");
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
  exports: Record<string, { import?: string; types?: string }>;
};
const publicContract = JSON.parse(readFileSync(resolve(packageRoot, "public-contract.json"), "utf8")) as {
  root: { values: string[]; types: string[] };
  react: { values: string[]; types: string[] };
};

describe("package exports", () => {
  test("every export points at public dist js and type paths", () => {
    for (const [subpath, target] of Object.entries(packageJson.exports)) {
      expect(
        Object.keys(target),
        `${subpath} must expose exactly the supported export conditions`,
      ).toEqual(["types", "import"]);
      expect(target.import, `${subpath} missing import condition`).toBeTruthy();
      expect(target.types, `${subpath} missing types condition`).toBeTruthy();
      expect(target.import, `${subpath} import target must point to built ESM`).toMatch(/^\.\/dist\/.+\.js$/);
      expect(target.types, `${subpath} types target must point to built declarations`).toMatch(/^\.\/dist\/.+\.d\.ts$/);
    }
  });

  test("package subpaths are limited to root and react", () => {
    expect(Object.keys(packageJson.exports).sort()).toEqual([".", "./react"]);
  });

  test("runtime value exports match public-contract.json", () => {
    expect(Object.keys(rootApi).sort()).toEqual([...publicContract.root.values].sort());
    expect(Object.keys(reactApi).sort()).toEqual([...publicContract.react.values].sort());
  });
});
