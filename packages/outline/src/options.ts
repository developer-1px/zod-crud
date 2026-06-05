import type {
  NormalizedStructureOptions,
  NormalizedTreeOptions,
  OutlineStructureOptions,
  OutlineTreeOptions,
} from "./types.js";

export function normalizeTreeOptions(options: OutlineTreeOptions): NormalizedTreeOptions {
  const maxDepth = options.maxDepth;
  return {
    maxDepth: maxDepth === undefined || !Number.isFinite(maxDepth)
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.floor(maxDepth)),
    includeValues: options.includeValues === true,
  };
}

export function normalizeStructureOptions(options: OutlineStructureOptions): NormalizedStructureOptions {
  return {
    childrenKey: options.childrenKey ?? "children",
  };
}
