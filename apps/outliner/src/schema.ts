// Outline 도메인 schema. 재귀 { text, children: Self[] }.

import { z } from "zod";

export type OutlineNode = { text: string; children: OutlineNode[] };

export const OutlineSchema: z.ZodType<OutlineNode> = z.object({
  text: z.string(),
  get children() { return z.array(OutlineSchema); },
});

export const SAMPLE: OutlineNode = {
  text: "zod-crud outliner",
  children: [
    { text: "Enter edit; Shift/Cmd+Enter insert", children: [] },
    { text: "Tab demote", children: [] },
    { text: "Shift+Tab promote", children: [] },
    { text: "Backspace empty delete", children: [] },
    {
      text: "Selection",
      children: [
        { text: "Click focus", children: [] },
        { text: "Shift+Click range", children: [] },
        { text: "Cmd/Ctrl+Click toggle", children: [] },
        { text: "Cmd+A select all", children: [] },
      ],
    },
    {
      text: "Clipboard",
      children: [
        { text: "Cmd+C copy", children: [] },
        { text: "Cmd+X cut", children: [] },
        { text: "Cmd+V paste sibling", children: [] },
        { text: "Cmd+Shift+V paste child", children: [] },
      ],
    },
    {
      text: "History",
      children: [
        { text: "Cmd+Z undo", children: [] },
        { text: "Cmd+Shift+Z redo", children: [] },
      ],
    },
  ],
};

export const EMPTY_NODE: OutlineNode = { text: "", children: [] };
