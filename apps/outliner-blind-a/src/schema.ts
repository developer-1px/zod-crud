import { z } from "zod";

export type OutlineNode = {
  id: string;
  text: string;
  children: OutlineNode[];
};

export type OutlineDoc = {
  nodes: OutlineNode[];
};

export const OutlineNodeSchema: z.ZodType<OutlineNode> = z.object({
  id: z.string().min(1),
  text: z.string(),
  children: z.array(z.lazy(() => OutlineNodeSchema)),
});

export const OutlineSchema = z.object({
  nodes: z.array(OutlineNodeSchema).min(1),
});

export const initialOutline: OutlineDoc = {
  nodes: [
    {
      id: "n-1",
      text: "Plan",
      children: [
        { id: "n-2", text: "Scope", children: [] },
        { id: "n-3", text: "Ship", children: [] },
      ],
    },
    { id: "n-4", text: "Notes", children: [] },
  ],
};
