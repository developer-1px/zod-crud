import { z } from "zod";
import { applyPatch } from "zod-crud";

// 1. 루트 스키마.
const Todo = z.object({
  title: z.string().min(1),
  done: z.boolean(),
  tags: z.array(z.string()),
});

// 2. 초기 값 — 그대로 plain JSON.
const initial: z.input<typeof Todo> = {
  title: "write zod-crud guide",
  done: false,
  tags: ["docs"],
};

// 3. RFC 6902 patch 로 편집. path 는 RFC 6901 Pointer.
const r = applyPatch(Todo, initial, [
  { op: "replace", path: "/title", value: "ship zod-crud guide" },
  { op: "copy", from: "/tags/0", path: "/tags/-" },
  { op: "test", path: "/tags/0", value: "docs" },
]);

// 4. 결과는 항상 schema 를 통과한 JSON.
if (r.result.ok) {
  console.log(r.state);
}
