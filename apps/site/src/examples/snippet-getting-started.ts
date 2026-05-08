import { z } from "zod";
import { createJsonCrud } from "zod-crud";

// 1. 루트 스키마.
const Todo = z.object({
  title: z.string().min(1),
  done: z.boolean(),
  tags: z.array(z.string()),
});

// 2. 초기 값. 스키마를 통과하지 못하면 createJsonCrud 가 throw.
const crud = createJsonCrud(Todo, {
  title: "write zod-crud guide",
  done: false,
  tags: ["docs"],
});

// 3. 노드 id 로 편집.
const root = crud.snapshot().rootId;
const titleId = crud.find(root, "title")!;
crud.update(titleId, "ship zod-crud guide");

// 4. 클립보드.
const tagsId = crud.find(root, "tags")!;
const firstTag = crud.snapshot().nodes[tagsId]!.children[0]!;
crud.copy(firstTag);
crud.paste(tagsId);

// 5. 히스토리.
crud.undo();
crud.redo();

// 6. 결과는 항상 스키마를 통과한 JSON.
console.log(crud.toJson());
