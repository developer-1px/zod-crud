// verbs/copy — Clipboard 기둥 (read-only).
// (state, source) → { payload }. side effect 0.
// system clipboard write 는 hooks 또는 사용자 코드에서 수행 (boundary: ADR-0002 §0.4).

import type { Pointer } from "../core/pointer/index.js";
import { cloneJson, jsonSerializableError } from "../core/json.js";
import { parsePointer, readAt } from "../core/pointer/index.js";
import { serialize } from "../core/pointer/serialize.js";
import { getArrayElement, getObjectKeys } from "../core/schema/introspection.js";
import type * as z from "zod";

export interface CopyOk {
  ok: true;
  /** RFC 8259 JSON 직렬화 가능한 fragment. 호출자가 navigator.clipboard.writeText(JSON.stringify(payload)) 로 외부 round-trip. */
  payload: unknown;
  source: Pointer;
}

export interface CopyError {
  ok: false;
  code: "path_not_found" | "not_serializable";
  message: string;
}

export type CopyResult = CopyOk | CopyError;

export interface ClipboardItemOptions {
  json?: boolean;
  tsv?: boolean;
  markdown?: boolean;
  html?: ((payload: unknown) => string) | string;
}

export type ClipboardItemMap = Record<string, string>;

/**
 * selection 의 source pointer 위치의 값을 JSON fragment payload 로 추출한다.
 * pure. state 는 변하지 않는다 (read-only).
 */
export function copy(state: unknown, source: Pointer): CopyResult {
  const segments = parsePointer(source);
  const r = readAt(state, segments);
  if (!r.ok) {
    return { ok: false, code: "path_not_found", message: `source not found: ${source}` };
  }
  const jsonErr = jsonSerializableError(r.value);
  if (jsonErr) {
    return { ok: false, code: "not_serializable", message: jsonErr };
  }
  // deep clone via JSON round-trip — payload 가 외부 round-trip 후에도 정합한지 보장.
  return { ok: true, payload: cloneJson(r.value), source };
}

export function toClipboardItems(payload: unknown, schema: z.ZodType, options: ClipboardItemOptions = {}): ClipboardItemMap {
  const includeJson = options.json ?? true;
  const items: ClipboardItemMap = {};
  const tsv = options.tsv ? toTsv(payload, schema) : null;

  if (includeJson) items["application/json"] = serialize(payload);
  if (tsv !== null) items["text/tab-separated-values"] = tsv;
  const markdown = options.markdown ? toMarkdown(payload, schema) : null;
  if (markdown !== null) items["text/markdown"] = markdown;
  if (options.html) items["text/html"] = typeof options.html === "function" ? options.html(payload) : options.html;
  items["text/plain"] = tsv ?? markdown ?? serialize(payload);

  return items;
}

export function toTsv(payload: unknown, schema: z.ZodType): string | null {
  const rows = normalizeRows(payload);
  if (!rows) return null;

  const columns = getColumns(schema, rows);
  if (columns.length === 0) return null;

  return [columns, ...rows.map((row) => columns.map((column) => row[column]))]
    .map((row) => row.map(formatTsvCell).join("\t"))
    .join("\n");
}

export function toMarkdown(payload: unknown, schema: z.ZodType): string {
  const rows = normalizeRows(payload);
  if (!rows) return `\`\`\`json\n${JSON.stringify(JSON.parse(serialize(payload)), null, 2)}\n\`\`\``;

  const columns = getColumns(schema, rows);
  if (columns.length === 0) return "";

  const header = `| ${columns.map(escapeMarkdownCell).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => escapeMarkdownCell(row[column])).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

function normalizeRows(payload: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(payload) && payload.every(isPlainRecord)) return payload;
  if (isPlainRecord(payload)) return [payload];
  return null;
}

function getColumns(schema: z.ZodType, rows: Array<Record<string, unknown>>): string[] {
  const rowSchema = getArrayElement(schema) ?? schema;
  const schemaKeys = getObjectKeys(rowSchema);
  if (schemaKeys) return schemaKeys.filter((key) => rows.some((row) => key in row));
  return Object.keys(rows[0] ?? {});
}

function formatTsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? serialize(value) : String(value);
  return text.replace(/\r?\n/g, " ");
}

function escapeMarkdownCell(value: unknown): string {
  return formatTsvCell(value).replace(/\|/g, "\\|");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
