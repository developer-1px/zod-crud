import * as z from "zod";

export type Task = {
  title: string;
  status: "todo" | "doing" | "done";
  owner: string;
  subtasks: Task[];
};

export type Section = {
  name: string;
  tasks: Task[];
};

export type PlanDocument = {
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

export const PlanDocumentSchema = z.object({
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
