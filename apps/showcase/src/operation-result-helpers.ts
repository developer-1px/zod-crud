import type { OperationResult } from "zod-crud";

export function isOperationResult(value: unknown): value is OperationResult {
  return typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof (value as { ok: unknown }).ok === "boolean";
}

export function validationMessage(result: OperationResult): string {
  if (result.ok) {
    return "Valid.";
  }

  const issues = result.error?.issues?.map((issue) => `${issue.path.join(".") || "/"}: ${issue.message}`);

  return issues === undefined || issues.length === 0
    ? result.reason
    : `${result.reason} ${issues.join(" ")}`;
}

export function failure(error: unknown): OperationResult {
  return {
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  };
}
