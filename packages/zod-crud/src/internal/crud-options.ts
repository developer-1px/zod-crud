import type { DefaultValueFactory, FocusFilter } from "../document/json-doc-types.js";

export type JsonCrudOptions = {
  childKeys?: string[];
  focusFilter?: FocusFilter;
  defaultFor?: DefaultValueFactory;
};
