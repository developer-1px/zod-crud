// ESLint config — verbs/ 끼리 import 금지 (ADR-0002 / SPEC §0.5 layer 규약).
// "verbs/* 끼리 import 금지. 합성은 command/document facade 에서만."

export default [
  {
    files: ["src/verbs/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./*", "../verbs/*"],
              message:
                "verbs/* 끼리 import 금지. 합성은 command/document facade 에서만 (ADR-0002 / SPEC §0.5). type-only import 는 허용 — `import type` 사용.",
            },
          ],
        },
      ],
    },
  },
];
