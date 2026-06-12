import { buildPointer, tryParsePointer, type Pointer } from "./index.js";

export function arrayIndexValue(seg: string): number | null {
  if (seg === "0") return 0;
  if (seg.length === 0) return null;
  const first = seg.charCodeAt(0);
  if (first < 49 || first > 57) return null;
  for (let index = 1; index < seg.length; index += 1) {
    const code = seg.charCodeAt(index);
    if (code < 48 || code > 57) return null;
  }
  return Number(seg);
}

export function arrayElementLocation(path: Pointer): { parent: Pointer; index: number } | null {
  if (path === "" || path[0] !== "/") return null;
  if (!path.includes("~")) {
    const indexSlash = path.lastIndexOf("/");
    if (indexSlash < 0) return null;
    const index = arrayIndexValue(path.slice(indexSlash + 1));
    return index === null
      ? null
      : { parent: path.slice(0, indexSlash), index };
  }
  const segments = tryParsePointer(path);
  if (segments === null) return null;
  const segment = segments[segments.length - 1];
  if (segment === undefined) return null;
  const index = arrayIndexValue(segment);
  if (index === null) return null;
  return {
    parent: buildPointer(segments.slice(0, -1)),
    index,
  };
}

export function appendArrayIndexes(parent: Pointer, indexes: ReadonlyArray<number>): Pointer[] {
  const targets = new Array<Pointer>(indexes.length);
  if (parent === "") {
    for (let index = 0; index < indexes.length; index += 1) {
      targets[index] = `/${indexes[index]!}`;
    }
    return targets;
  }

  for (let index = 0; index < indexes.length; index += 1) {
    targets[index] = `${parent}/${indexes[index]!}`;
  }
  return targets;
}
