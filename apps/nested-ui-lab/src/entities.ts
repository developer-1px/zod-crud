import * as z from "zod";

import {
  createJsonCrud,
  type JsonCrud,
  type JsonNode,
  type JsonValue,
} from "zod-crud";

type Task = {
  title: string;
  status: "todo" | "doing" | "done";
  owner: string;
  subtasks: Task[];
};

type Section = {
  name: string;
  tasks: Task[];
};

type PlanDocument = {
  title: string;
  meta: {
    owner: string;
    priority: "low" | "medium" | "high";
  };
  sections: Section[];
  tags: string[];
};

const TaskSchema: z.ZodType<Task> = z.lazy(() =>
  z.object({
    title: z.string().min(1),
    status: z.union([z.literal("todo"), z.literal("doing"), z.literal("done")]),
    owner: z.string().min(1),
    subtasks: z.array(TaskSchema),
  }),
);

const PlanDocumentSchema = z.object({
  title: z.string().min(1),
  meta: z.object({
    owner: z.string().min(1),
    priority: z.union([z.literal("low"), z.literal("medium"), z.literal("high")]),
  }),
  sections: z.array(z.object({
    name: z.string().min(1),
    tasks: z.array(TaskSchema),
  })),
  tags: z.array(z.string().min(1)),
});

const initialPlan: PlanDocument = {
  title: "Projection lab plan",
  meta: {
    owner: "Editor team",
    priority: "high",
  },
  sections: [
    {
      name: "Model",
      tasks: [
        {
          title: "Keep stable node ids",
          status: "done",
          owner: "Ari",
          subtasks: [],
        },
        {
          title: "Add rename command",
          status: "doing",
          owner: "Bea",
          subtasks: [
            {
              title: "Reject invalid schema rename",
              status: "todo",
              owner: "Bea",
              subtasks: [],
            },
          ],
        },
      ],
    },
    {
      name: "Views",
      tasks: [
        {
          title: "Render treegrid",
          status: "done",
          owner: "Cy",
          subtasks: [],
        },
        {
          title: "Render nested cards",
          status: "todo",
          owner: "Cy",
          subtasks: [],
        },
      ],
    },
  ],
  tags: ["jsondoc", "projection", "nested-ui"],
};

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
  createValue: (parent, index) => {
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
  },
};

export function makeEditor(): JsonCrud<JsonValue> {
  return createJsonCrud(labEntity.schema, labEntity.initialValue, {
    childKeys: labEntity.childKeys,
  });
}
