import type { PlanDocument } from "./lab-schema.js";

export const initialPlan: PlanDocument = {
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
