import * as z from "zod";

import type {
  JsonNode,
  JsonValue,
} from "zod-crud";

import { initialPlan } from "./initial-plan.js";
import { PlanDocumentSchema } from "./lab-schema.js";

export type LabEntity = {
  id: string;
  label: string;
  schema: z.ZodType<JsonValue, unknown>;
  initialValue: JsonValue;
  childKeys: string[];
  createValue: (parent: JsonNode, index: number) => JsonValue;
};

export const labEntity: LabEntity = {
  id: "projection-plan",
  label: "Projection plan",
  schema: PlanDocumentSchema as unknown as z.ZodType<JsonValue, unknown>,
  initialValue: initialPlan,
  childKeys: ["sections", "tasks", "subtasks", "tags"],
  createValue: createLabValue,
};

function createLabValue(parent: JsonNode, index: number): JsonValue {
  if (parent.key === "sections") {
    return {
      name: `Section ${index + 1}`,
      tasks: [],
    };
  }

  if (parent.key === "tags") {
    return `tag-${index + 1}`;
  }

  return {
    title: `Task ${index + 1}`,
    status: "todo",
    owner: "Unassigned",
    subtasks: [],
  };
}
