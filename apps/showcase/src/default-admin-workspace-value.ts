import type {
  JsonPath,
  JsonValue,
} from "zod-crud";

export function defaultAdminWorkspaceValue(parentPath: JsonPath, index: number): JsonValue {
  const parentKey = parentPath[parentPath.length - 1];

  if (parentKey === "users") {
    return {
      name: `User ${index}`,
      email: `user${index}@example.com`,
      role: "viewer",
      active: true,
      quota: 10,
      tags: [],
    };
  }

  if (parentKey === "tasks") {
    return {
      title: `Task ${index}`,
      status: "todo",
      estimate: 1,
    };
  }

  return `tag-${index}`;
}
