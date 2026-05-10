// SSOT: Vite glob이 packages/zod-crud/src/**/*.{ts,tsx} 전체를 자동 수집한다.
// 새 파일을 추가하거나 옮길 때 이 파일을 손댈 필요가 없다.

const PACKAGE_PREFIX = "../../../../packages/zod-crud/src/";

const rawSources = import.meta.glob(
  "../../../../packages/zod-crud/src/**/*.{ts,tsx}",
  { eager: true, import: "default", query: "?raw" }
) as Record<string, string>;

export const packageSources: Record<string, string> = Object.fromEntries(
  Object.entries(rawSources).map(([key, source]) => [key.slice(PACKAGE_PREFIX.length), source]),
);

export function getPackageSource(relativePath: string): { filename: string; source: string } {
  const source = packageSources[relativePath];
  if (source === undefined) {
    throw new Error(
      `source-registry: "${relativePath}" not found in packages/zod-crud/src. ` +
        `Did the file move? Available: ${Object.keys(packageSources).slice(0, 5).join(", ")}…`,
    );
  }
  return { filename: relativePath, source };
}

export function listPackagePaths(): string[] {
  return Object.keys(packageSources).sort();
}
