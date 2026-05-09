// Frequency tier per API id. 1 = essential, 2 = common, 3 = all.
// Anything not listed is tier 3 (rare/advanced).

export const ESSENTIAL_IDS = new Set<string>([
  "snapshot",
  "toJson",
  "read",
  "create",
  "update",
  "delete",
  "copy",
  "cut",
  "paste",
  "undo",
  "redo",
  "subscribe",
]);

export const COMMON_IDS = new Set<string>([
  ...ESSENTIAL_IDS,
  "pathOf",
  "find",
  "insertAfter",
  "insertBefore",
  "appendChild",
  "rename",
  "copyMany",
  "cutMany",
  "canUndo",
  "canRedo",
]);

export type TierLevel = "essential" | "common" | "all";

export function tierAccepts(level: TierLevel, apiId: string): boolean {
  if (level === "all") return true;
  if (level === "common") return COMMON_IDS.has(apiId);
  return ESSENTIAL_IDS.has(apiId);
}
