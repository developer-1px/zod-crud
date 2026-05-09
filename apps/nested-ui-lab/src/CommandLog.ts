import type { OperationResult } from "zod-crud";

export type CommandLog = {
  command: string;
  result: OperationResult;
};
