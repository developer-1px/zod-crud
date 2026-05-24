// 회귀: GH #52 — z.record 스키마의 dynamic key 가 PointerOf<T> 에 의해 거부되는지.
// 결론: PointerOf 의 mapped type 이 keyof string index 를 그대로 흘려보내므로
// `/${string}` 패턴이 자연스럽게 union 에 포함된다. `as never` 캐스팅 불필요.

import * as z from "zod";
import type { JSONDocument } from "../../src/index.js";

const Schema = z.object({ cells: z.record(z.string(), z.string()) });
type T = z.output<typeof Schema>;

declare const doc: JSONDocument<T>;
declare const sheet: T;

const writeCell = (k: string, v: string) => {
  if (v === "") {
    if (sheet.cells[k] !== undefined) doc.patch({ op: "remove", path: `/cells/${k}` });
  } else if (sheet.cells[k] === undefined) {
    doc.patch({ op: "add", path: `/cells/${k}`, value: v });
  } else if (sheet.cells[k] !== v) {
    doc.patch({ op: "replace", path: `/cells/${k}`, value: v });
  }
};

void writeCell;
