export type PasteMode = "auto" | "child" | "overwrite";

export type PasteOptions = {
  mode?: PasteMode;
  childKeys?: string[];
  index?: number;
};
