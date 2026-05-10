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
    { text: "Enter — insert sibling after focus", children: [] },
    { text: "Tab — demote (move into prev sibling)", children: [] },
    { text: "Shift+Tab — promote (move out to parent's sibling)", children: [] },
    { text: "Backspace on empty — remove", children: [] },
    {
      text: "Selection",
      children: [
        { text: "Click — focus single", children: [] },
        { text: "Shift+Click — range select", children: [] },
        { text: "Cmd/Ctrl+Click — toggle", children: [] },
        { text: "Cmd+A — select all", children: [] },
      ],
    },
    {
      text: "Clipboard",
      children: [
        { text: "Cmd+C — copy selection", children: [] },
        { text: "Cmd+X — cut selection", children: [] },
        { text: "Cmd+V — paste as sibling", children: [] },
        { text: "Cmd+Shift+V — paste as child", children: [] },
      ],
    },
    {
      text: "History",
      children: [
        { text: "Cmd+Z — undo", children: [] },
        { text: "Cmd+Shift+Z — redo", children: [] },
      ],
    },
  ],
};

export const EMPTY_NODE: OutlineNode = { text: "", children: [] };
