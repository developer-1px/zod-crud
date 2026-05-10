// SPEC §1.x — JSON Schema (draft-2020-12) 양방향 변환.
// zod 4 가 정본 — 우리는 명시적 re-export 로 표준 표면을 보장한다.
//
// 외부 도구 (Ajv · OpenAPI · AsyncAPI) 가 받는 표면 = JSON Schema.
// 우리 schema 가 zod-only 면 외부와 다리 없음 — 그래서 zod ↔ JSON Schema
// 양방향이 필수.

import { toJSONSchema as zodToJSONSchema, fromJSONSchema as zodFromJSONSchema, type z } from "zod";

/**
 * zod schema 를 JSON Schema (draft-2020-12) 로 export.
 * Ajv / OpenAPI / 코드젠 / 외부 검증 도구와의 다리.
 *
 * @example
 * ```ts
 * const S = z.object({ name: z.string().min(1) });
 * const jsonSchema = toJSONSchema(S);
 * // → { $schema, type:"object", properties:{ name:{ type:"string", minLength:1 } }, ... }
 * ```
 */
export const toJSONSchema = zodToJSONSchema;

/**
 * JSON Schema (draft-2020-12) 를 zod schema 로 import.
 * 서버 스펙 / 외부 contract 를 클라 검증으로 흡수.
 *
 * 미지원 키워드 (`if/then/else`, `dependentSchemas` 등) 는 silent 무시 대신
 * zod 4 가 명시적 변환 — 자세한 동작은 zod 4 문서 참조.
 */
export const fromJSONSchema = zodFromJSONSchema;

export type { z };
