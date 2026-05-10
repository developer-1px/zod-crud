// SPEC §5 surface — RFC 6902 6 op + lifecycle.
// 1 = essential (RFC 6902 6 op + hook entry), 2 = common (history/lifecycle),
// 3 = all (low-level helpers).

export const ESSENTIAL_IDS = new Set<string>([
  "useJson",
  "ops.add",
  "ops.remove",
  "ops.replace",
  "ops.move",
  "ops.copy",
  "ops.test",
  "ops.patch",
  "applyOperation",
  "applyPatch",
]);

export const COMMON_IDS = new Set<string>([
  ...ESSENTIAL_IDS,
  "ops.undo",
  "ops.redo",
  "ops.canUndo",
  "ops.canRedo",
  "ops.load",
  "ops.reset",
  "serialize",
  "parse",
  "safeParse",
]);

export type TierLevel = "essential" | "common" | "all";

export function tierAccepts(level: TierLevel, apiId: string): boolean {
  if (level === "all") return true;
  if (level === "common") return COMMON_IDS.has(apiId);
  return ESSENTIAL_IDS.has(apiId);
}
