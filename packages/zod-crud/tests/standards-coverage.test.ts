// P8.1 — RFC ↔ core/* 1:1 매핑 자동 검증.
// STANDARDS.md 의 표 ↔ src/core/ 디렉터리 일치 확인.
import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import packageJson from "../package.json" with { type: "json" };
import tests from "./conformance/tests.json" with { type: "json" };
import specTests from "./conformance/spec_tests.json" with { type: "json" };

const root = resolve(__dirname, "..");
const corePath = resolve(root, "src/core");

const expectedCoreFolders = [
  "pointer",     // RFC 6901
  "patch",       // RFC 6902
  "jsonpath",    // RFC 9535
  "selection",   // W3C Selection + WAI-ARIA
  "schema",      // RFC 8927 + Zod
];

const expectedCoreFiles = [
  "json.ts",     // RFC 8259 JSON value boundary
  "track.ts",    // RFC 6902 op 적용 후 Pointer follow (인프라)
  "history.ts",  // RFC 6902 inverse + history stack (pure reducer)
];

describe("STANDARDS.md ↔ core/* 1:1 매핑", () => {
  test("expected core/ 폴더가 모두 존재", () => {
    for (const dir of expectedCoreFolders) {
      const p = resolve(corePath, dir);
      expect(existsSync(p), `missing: core/${dir}`).toBe(true);
      expect(statSync(p).isDirectory()).toBe(true);
    }
  });

  test("expected core/ 파일이 모두 존재", () => {
    for (const f of expectedCoreFiles) {
      expect(existsSync(resolve(corePath, f)), `missing: core/${f}`).toBe(true);
    }
  });

  test("core/ 에 STANDARDS.md 미등재 폴더 없음 (정합 근거 없는 substrate 거부)", () => {
    const actual = readdirSync(corePath, { withFileTypes: true });
    for (const e of actual) {
      if (e.isDirectory()) {
        expect(
          expectedCoreFolders.includes(e.name),
          `core/${e.name} 가 STANDARDS.md 표에 없음 — 표 갱신 또는 폴더 제거`,
        ).toBe(true);
      } else if (e.name.endsWith(".ts")) {
        expect(
          expectedCoreFiles.includes(e.name),
          `core/${e.name} 가 STANDARDS.md 표에 없음`,
        ).toBe(true);
      }
    }
  });

  test("README conflict policy matches SPEC §11", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const spec = readFileSync(resolve(root, "SPEC.md"), "utf8");

    expect(readme).not.toContain("outranks code");
    expect(readme).toContain("SPEC §11 applies");
    expect(readme).toContain("code behavior wins unless it");
    expect(readme).toContain("conflicts with an RFC");
    expect(spec).toContain("현재 코드 동작이 이긴다");
    expect(spec).toContain("RFC가 이긴다");
  });

  test("README API table lists every SPEC §5.6 pointer helper", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const spec = readFileSync(resolve(root, "SPEC.md"), "utf8");
    const section = spec.slice(
      spec.indexOf("### 5.6 RFC 6901 Pointer 헬퍼"),
      spec.indexOf("### 5.7 `useSelection`"),
    );
    const helpers = Array.from(section.matchAll(/export function (\w+)\(/g), (match) => match[1]);

    expect(helpers).toEqual([
      "parsePointer",
      "tryParsePointer",
      "buildPointer",
      "escapeSegment",
      "unescapeSegment",
      "parentPointer",
      "lastSegment",
      "lastSegmentIndex",
      "appendSegment",
      "withLastSegment",
    ]);

    for (const helper of helpers) {
      expect(readme, `README API table missing SPEC §5.6 helper: ${helper}`).toContain(`\`${helper}\``);
    }
  });

  test("README doc.ops row lists every JSONOps member", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const jsonOpsSource = readFileSync(resolve(root, "src/jsonOps.ts"), "utf8");
    const interfaceBody = jsonOpsSource.slice(
      jsonOpsSource.indexOf("export interface JSONOps<T>"),
      jsonOpsSource.indexOf("\n}", jsonOpsSource.indexOf("export interface JSONOps<T>")),
    );
    const methods = Array.from(interfaceBody.matchAll(/^\s{2}(\w+)[(<]/gm), (match) => match[1]);
    const readonlyProperties = Array.from(interfaceBody.matchAll(/^\s{2}readonly\s+(\w+):/gm), (match) => match[1]);
    const members = [...readonlyProperties, ...methods].sort();

    expect(members).toEqual([
      "add",
      "apply",
      "copy",
      "load",
      "move",
      "patch",
      "remove",
      "replace",
      "reset",
      "set",
      "state",
      "subscribe",
      "test",
    ]);

    const opsRow = readme
      .split("\n")
      .find((line) => line.startsWith("| `doc.ops` |"));
    expect(opsRow, "README must document doc.ops").toBeTruthy();
    for (const member of members) {
      expect(opsRow, `README doc.ops row missing JSONOps member: ${member}`).toContain(`\`${member}\``);
    }
  });

  test("README API table lists React entrypoint hook exports", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const reactSource = readFileSync(resolve(root, "src/react.ts"), "utf8");
    const hooks = Array.from(
      reactSource.matchAll(/^export \{ ([^}]+) \} from "\.\/hooks\//gm),
      (match) => {
        const exports = match[1];
        if (exports === undefined) throw new Error("React hook export capture failed");
        return exports.split(",").map((name) => name.trim());
      },
    ).flat().sort();

    expect(hooks).toEqual([
      "useDraft",
      "useField",
      "useJSON",
      "useJSONDocument",
      "useJSONSlice",
      "useSelection",
    ]);

    const apiSection = readme.slice(readme.indexOf("## API"), readme.indexOf("## Guarantees"));
    for (const hook of hooks) {
      expect(apiSection, `README API table missing React hook export: ${hook}`).toContain(`\`${hook}`);
    }
  });

  test("README API table lists every root entrypoint export", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const rootSource = readFileSync(resolve(root, "src/index.ts"), "utf8");
    const apiSection = readme.slice(readme.indexOf("## API"), readme.indexOf("## Guarantees"));
    const exportBlocks = Array.from(rootSource.matchAll(/export(?: type)? \{([\s\S]*?)\} from/g), (match) => {
      const block = match[1];
      if (block === undefined) throw new Error("root export capture failed");
      return block;
    });
    const exports = exportBlocks
      .flatMap((block) => block.split(","))
      .map((part) => part.replace(/\/\/.*$/gm, "").trim())
      .filter(Boolean)
      .map((part) => part.split(/\s+as\s+/).at(-1)?.split(/\s+/)[0])
      .filter((name): name is string => name !== undefined)
      .sort();

    for (const name of exports) {
      expect(apiSection, `README API table missing root export: ${name}`).toContain(`\`${name}`);
    }
  });

  test("SPEC RFC 6902 conformance count matches vendored suite", () => {
    const spec = readFileSync(resolve(root, "SPEC.md"), "utf8");
    const cases = [...(tests as Array<{ disabled?: boolean }>), ...(specTests as Array<{ disabled?: boolean }>)];
    const disabled = cases.filter((c) => c.disabled).length;

    expect(spec).toContain(`합계 ${cases.length} 케이스`);
    expect(spec).toContain(`그중 ${disabled} 케이스는 suite 자체에서 disabled`);
  });

  test("README package-local links resolve inside published files", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const publishedFiles = new Set((packageJson as { files: string[] }).files);
    const links = Array.from(readme.matchAll(/\[[^\]]+\]\((\.\/[^)#]+)(?:#[^)]+)?\)/g), (match) => {
      const link = match[1];
      if (link === undefined) throw new Error("README package-local link capture failed");
      return link.slice(2);
    });

    for (const link of links) {
      expect(publishedFiles, `README link must resolve in npm package files: ${link}`).toContain(link);
    }
  });

  test("README install section matches peer dependency contract", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const pkg = packageJson as {
      peerDependencies: Record<string, string>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };

    expect(pkg.peerDependencies).toEqual({ react: ">=18", zod: "^4.0.0" });
    expect(pkg.peerDependenciesMeta?.react?.optional).toBe(true);
    expect(readme).toContain("npm install zod-crud zod");
    expect(readme).toContain("`zod` is a peer dependency");
    expect(readme).toContain("`react >=18` is an optional peer dependency");
    expect(readme).toContain("required only for React hooks");
    expect(readme).toContain("The package is ESM-only");
  });

  test("package metadata keeps npm publication fields intact", () => {
    const pkg = packageJson as {
      name: string;
      license: string;
      homepage: string;
      repository?: { type?: string; url?: string; directory?: string };
      bugs?: { url?: string };
      keywords?: string[];
    };

    expect(pkg.name).toBe("zod-crud");
    expect(pkg.license).toBe("MIT");
    expect(pkg.homepage).toBe("https://developer-1px.github.io/zod-crud/");
    expect(pkg.repository).toEqual({
      type: "git",
      url: "git+https://github.com/developer-1px/zod-crud.git",
      directory: "packages/zod-crud",
    });
    expect(pkg.bugs?.url).toBe("https://github.com/developer-1px/zod-crud/issues");
    expect(pkg.keywords).toEqual(expect.arrayContaining(["zod", "json", "crud", "schema", "clipboard", "undo", "redo", "headless"]));
  });

  test("package scripts keep build, prepack, typecheck, and smoke gates intact", () => {
    const pkg = packageJson as { scripts: Record<string, string> };

    expect(pkg.scripts.clean).toBe("rm -rf dist");
    expect(pkg.scripts.build).toBe("npm run clean && tsc -p tsconfig.json");
    expect(pkg.scripts.prepack).toBe("npm run build");
    expect(pkg.scripts.typecheck).toBe("tsc -p tsconfig.test.json --noEmit");
    expect(pkg.scripts.test).toBe("vitest run --config vitest.config.ts");
    expect(pkg.scripts["smoke:package"]).toBe("node ./test/package-smoke.mjs");
    expect(pkg.scripts.verify).toBe("npm run typecheck && npm test && npm run build && npm run smoke:package");
  });

  test("root verify script keeps workspace gates intact", () => {
    const monorepoPackageJson = JSON.parse(readFileSync(resolve(root, "..", "..", "package.json"), "utf8")) as {
      private?: boolean;
      workspaces?: string[];
      scripts: Record<string, string>;
    };

    expect(monorepoPackageJson.private).toBe(true);
    expect(monorepoPackageJson.workspaces).toEqual(["packages/*", "apps/*"]);
    expect(monorepoPackageJson.scripts.test).toBe("npm test -w zod-crud");
    expect(monorepoPackageJson.scripts.typecheck).toBe(
      "npm run typecheck -w zod-crud && npm run typecheck -w @zod-crud/site && npm run typecheck -w @zod-crud/outliner && npm run typecheck -w @zod-crud/mobile-cms",
    );
    expect(monorepoPackageJson.scripts.build).toBe(
      "npm run build -w zod-crud && npm run build -w @zod-crud/site && npm run build -w @zod-crud/outliner && npm run build -w @zod-crud/mobile-cms",
    );
    expect(monorepoPackageJson.scripts["smoke:package"]).toBe("npm run smoke:package -w zod-crud");
    expect(monorepoPackageJson.scripts.verify).toBe(
      "npm run typecheck && npm test && npm run build && npm run smoke:package",
    );
  });

  test("CHANGELOG latest release matches package version", () => {
    const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
    const version = (packageJson as { version: string }).version;
    const latestRelease = changelog.match(/^##\s+(\d+\.\d+\.\d+)\s+-\s+\d{4}-\d{2}-\d{2}$/m)?.[1];

    expect(latestRelease, "CHANGELOG must start with a dated release entry").toBe(version);
  });
});
