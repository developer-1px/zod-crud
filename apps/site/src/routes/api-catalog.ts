// SSOT: JsonCrud<T,I> 타입 본문에서 메서드와 axis를 직접 파싱한다.
// 새 메서드를 JsonCrud에 추가하면 이 카탈로그도 자동으로 따라온다.
// 손으로 유지하는 것은 "axis → 구현 파일 경로" 매핑 한 테이블뿐.

import { getPackageSource, listPackagePaths, packageSources } from "./source-registry";

export type ApiSource = { path: string; symbols?: string[] };
export type ApiEntry = { id: string; call: string; sources: ApiSource[] };
export type ApiGroup = { title: string; apis: ApiEntry[] };
export type ApiId = string;

// ── axis name → 구현 파일 경로 (수동 유지하는 유일한 매핑) ──────────────
// JsonCrud 안의 axis 주석 텍스트를 키로 쓴다.
const sourcesByAxis: Record<string, ApiSource[]> = {
  "read": [{ path: "internal/json-crud-instance.ts" }],
  "selection": [
    { path: "internal/json-crud-instance.ts" },
    { path: "selection/select.ts", symbols: ["select"] },
  ],
  "mutate (single)": [{ path: "mutate/mutations.ts", symbols: ["createMutations"] }],
  "mutate (multi)": [
    { path: "mutate/move.ts", symbols: ["createMove"] },
    { path: "mutate/move-plan.ts" },
    { path: "mutate/delete-many.ts", symbols: ["planDeleteMany"] },
  ],
  "mutate (transaction)": [{ path: "internal/json-crud-instance.ts" }],
  "mutate (tree-shape)": [{ path: "internal/json-crud-instance.ts" }],
  "clipboard": [
    { path: "clipboard/clipboard.ts", symbols: ["createClipboard"] },
    { path: "clipboard/paste/dispatch.ts", symbols: ["buildPastePlans", "buildPasteManyPlans"] },
  ],
  "history": [
    { path: "history/json-history.ts", symbols: ["createHistory"] },
    { path: "history/change/change-diff.ts" },
  ],
  "lifecycle / dirty": [{ path: "internal/json-crud-instance.ts" }],
  "schema introspection": [{ path: "internal/json-crud-instance.ts" }],
  "locked regions": [{ path: "internal/json-crud-instance.ts" }],
};

// ── JsonCrud 타입 외 entry (수동) ──────────────────────────────────────
const factoryGroup: ApiGroup = {
  title: "Factory",
  apis: [
    {
      id: "createJsonCrud",
      call: "createJsonCrud(schema, initial, options?)",
      sources: [
        { path: "json-crud.ts", symbols: ["createJsonCrud"] },
        { path: "internal/json-crud-instance.ts", symbols: ["createJsonCrudInstance"] },
      ],
    },
  ],
};

const documentGroup: ApiGroup = {
  title: "Document",
  apis: [
    { id: "serialize", call: "serialize(value)", sources: [{ path: "document/json-doc-serialization.ts", symbols: ["serialize"] }] },
    { id: "deserialize", call: "deserialize(doc, nodeId?)", sources: [{ path: "document/json-doc-serialization.ts", symbols: ["deserialize"] }] },
    { id: "getPath", call: "getPath(doc, nodeId)", sources: [{ path: "document/json-doc-access.ts", symbols: ["getPath"] }] },
  ],
};

// ── JsonCrud 타입 본문 파싱 ────────────────────────────────────────────

type ParsedMethod = { name: string; signature: string; axis: string };

function parseJsonCrudMethods(): ParsedMethod[] {
  const src = getPackageSource("json-crud.ts").source;
  const typeMatch = /export type JsonCrud<[^=]*?>\s*=\s*\{([\s\S]*?)\n\};/.exec(src);
  if (!typeMatch) {
    throw new Error("api-catalog: cannot locate `export type JsonCrud<...> = { ... };` in json-crud.ts");
  }
  const body = typeMatch[1] ?? "";

  const methods: ParsedMethod[] = [];
  let currentAxis = "read";
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;
    const axisMatch = /^\/\/\s*──+\s*(.+?)\s*──+/.exec(line);
    if (axisMatch && axisMatch[1] !== undefined) {
      currentAxis = normalizeAxis(axisMatch[1]);
      continue;
    }
    if (line.startsWith("//")) continue;
    const methodMatch = /^(\w+)\s*:\s*(.+?);?\s*$/.exec(line);
    if (!methodMatch || methodMatch[1] === undefined || methodMatch[2] === undefined) continue;
    methods.push({ name: methodMatch[1], signature: methodMatch[2], axis: currentAxis });
  }
  return methods;
}

function normalizeAxis(raw: string): string {
  return raw.replace(/\s*──+\s*$/, "").replace(/^\s*──+\s*/, "").replace(/\s*stubs?\s*$/i, "").replace(/\s*stub\s*$/i, "").trim();
}

function deriveCallFromSignature(name: string, signature: string): string {
  const argMatch = /\(([^)]*)\)/.exec(signature);
  if (!argMatch) return `crud.${name}`;
  const args = (argMatch[1] ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const colon = p.indexOf(":");
      const argName = (colon >= 0 ? p.slice(0, colon) : p).trim();
      return argName.endsWith("?") ? `${argName.slice(0, -1)}?` : argName;
    })
    .join(", ");
  return `crud.${name}(${args})`;
}

function buildAxisGroups(): ApiGroup[] {
  const methods = parseJsonCrudMethods();
  const byAxis = new Map<string, ParsedMethod[]>();
  for (const m of methods) {
    const list = byAxis.get(m.axis);
    if (list) list.push(m);
    else byAxis.set(m.axis, [m]);
  }
  const groups: ApiGroup[] = [];
  for (const [axis, list] of byAxis) {
    const sources = sourcesByAxis[axis];
    if (!sources) {
      throw new Error(
        `api-catalog: axis "${axis}" parsed from JsonCrud has no entry in sourcesByAxis. ` +
          `Add it to sourcesByAxis with the implementation path(s).`,
      );
    }
    groups.push({
      title: titleCase(axis),
      apis: list.map((m) => ({
        id: m.name,
        call: deriveCallFromSignature(m.name, m.signature),
        sources,
      })),
    });
  }
  return groups;
}

function titleCase(axis: string): string {
  return axis
    .split(" ")
    .map((part) => {
      if (part.length === 0) return part;
      if (part.startsWith("(") || part === "/") return part;
      return (part[0] ?? "").toUpperCase() + part.slice(1);
    })
    .join(" ");
}

// ── 빌드 타임 path 검증 ───────────────────────────────────────────────
function validatePaths(groups: ApiGroup[]): void {
  const known = new Set(listPackagePaths());
  const missing: string[] = [];
  for (const g of groups) {
    for (const api of g.apis) {
      for (const src of api.sources) {
        if (!known.has(src.path)) missing.push(`${g.title}/${api.id} → ${src.path}`);
      }
    }
  }
  // sourcesByAxis도 직접 검사 (JsonCrud에 매칭되는 axis가 없어도 잡히도록)
  for (const [axis, sources] of Object.entries(sourcesByAxis)) {
    for (const src of sources) {
      if (!known.has(src.path)) missing.push(`sourcesByAxis[${axis}] → ${src.path}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(`api-catalog: ${missing.length} broken source path(s):\n  ${missing.join("\n  ")}`);
  }
}

// 모듈 로드 시점에 sourceMap 미접근 보장 (build break early)
void packageSources;

export const apiGroups: ApiGroup[] = (() => {
  const groups = [factoryGroup, documentGroup, ...buildAxisGroups()];
  validatePaths(groups);
  return groups;
})();
