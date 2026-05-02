import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = await mkdtemp(join(tmpdir(), "zod-crud-package-"));

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    stdio: "pipe",
  });
}

try {
  const packOutput = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", workspace],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const [packResult] = JSON.parse(packOutput);
  const tarball = join(workspace, packResult.filename);
  const consumer = join(workspace, "consumer");
  const zodPackage = join(repoRoot, "node_modules", "zod");

  if (!existsSync(tarball)) {
    throw new Error(`Packed tarball was not created: ${tarball}`);
  }

  if (!existsSync(zodPackage)) {
    throw new Error("Local zod dependency is missing. Run npm install first.");
  }

  await writeFile(
    join(workspace, "package.json"),
    JSON.stringify({ private: true }, null, 2),
  );
  await writeFile(
    join(workspace, "smoke.mjs"),
    [
      'import * as z from "zod";',
      'import { createJsonCrud } from "zod-crud";',
      'const editor = createJsonCrud(z.object({ name: z.string() }), { name: "ok" });',
      'if (editor.toJson().name !== "ok") throw new Error("runtime import failed");',
    ].join("\n"),
  );
  await writeFile(
    join(workspace, "smoke.ts"),
    [
      'import * as z from "zod";',
      'import { createJsonCrud, type JsonValue } from "zod-crud";',
      'const value: JsonValue = { name: "ok" };',
      'const editor = createJsonCrud(z.object({ name: z.string() }), value);',
      'editor.toJson().name satisfies string;',
    ].join("\n"),
  );

  await rm(consumer, { force: true, recursive: true });
  await writeFile(
    join(workspace, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: {
        "zod-crud": `file:${tarball}`,
        zod: `file:${zodPackage}`,
      },
    }, null, 2),
  );

  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock"], workspace);
  run("node", ["smoke.mjs"], workspace);
  run(
    "node",
    [
      join(repoRoot, "node_modules", "typescript", "bin", "tsc"),
      "--noEmit",
      "--skipLibCheck",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "smoke.ts",
    ],
    workspace,
  );
} finally {
  await rm(workspace, { force: true, recursive: true });
}
