import type { ApiId } from "./api-catalog.js";

export type ApiRun = {
  api: ApiId;
  call: string;
  output: unknown;
};
