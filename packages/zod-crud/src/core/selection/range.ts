// 같은 부모 array 안에서만 [anchor..focus] 인덱스 범위 펼침. 그 외는 두 좌표만.

import type { Pointer } from "../pointer/index.js";

export function expandRange(anchor: Pointer, focus: Pointer): Pointer[] {
  const aSeg = anchor.split("/");
  const fSeg = focus.split("/");
  if (aSeg.length !== fSeg.length || aSeg.length < 2) return uniq([anchor, focus]);
  for (let i = 0; i < aSeg.length - 1; i++) if (aSeg[i] !== fSeg[i]) return uniq([anchor, focus]);
  const aIdx = Number(aSeg[aSeg.length - 1]);
  const fIdx = Number(fSeg[fSeg.length - 1]);
  if (!Number.isInteger(aIdx) || !Number.isInteger(fIdx)) return uniq([anchor, focus]);
  const lo = Math.min(aIdx, fIdx);
  const hi = Math.max(aIdx, fIdx);
  const parent = aSeg.slice(0, -1).join("/");
  const out: Pointer[] = [];
  for (let i = lo; i <= hi; i++) out.push(`${parent}/${i}`);
  return out;
}

function uniq(arr: Pointer[]): Pointer[] {
  return Array.from(new Set(arr));
}
