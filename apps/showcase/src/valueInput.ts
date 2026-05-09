import type { JsonNode } from "zod-crud";

export function valueInput(node: JsonNode | undefined): string {
  if (node === undefined || node.value === undefined) {
    return "";
  }

  return String(node.value);
}
