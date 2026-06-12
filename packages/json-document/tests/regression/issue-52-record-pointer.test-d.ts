// 회귀: GH #52 — z.record 스키마의 dynamic key patch path 가 거부되지 않는지.
// public JSONPatchOperation path 는 Pointer(string) 이므로 dynamic key 에 `as never` 캐스팅이 필요 없다.

import * as z from "zod";
import type { JSONDocument } from "@interactive-os/json-document";

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
