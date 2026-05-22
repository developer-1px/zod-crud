# Evaluation Loop Ledger

Goal: run 100 evaluation -> execution -> scoring loops for the zod-crud docs and demos before release.

This ledger is the progress record. A loop only counts when all three parts are present:

- Evaluate: name the user-facing confusion or missing proof.
- Execute: change docs, demo, tests, or verification assets toward that finding.
- Score: record current evidence after the change.

## Score Axes

Each loop scores only the axis it tries to improve.

| Axis | Passing evidence |
| --- | --- |
| API correctness | Docs/demo use the current public API and avoid private modules or stale names. |
| Target clarity | Raw insertion pointers and `{ before | after | replace }` value-relative targets are not mixed. |
| Task discoverability | A user can find the action needed to verify a real editing task. |
| State observability | Selection, clipboard, result, state, and patch effects are inspectable after each action. |
| LLM copyability | An LLM can copy an example without adding commit-after-mutation or `{ at }` mistakes. |
| Runtime health | Typecheck, tests, build, or browser checks cover the changed surface. |

## Progress

3 / 100 loops complete.

| Loop | Evaluate | Execute | Score |
| --- | --- | --- | --- |
| 001 | The workbench used one `target` for both existing values and insertion positions. That made `paste({ after: target })`, `paste("/cards/-")`, schema insert checks, and move destinations hard to distinguish. Clipboard state was also only `set/empty`, so repeated copy/paste behavior could not be graded from the UI. | Split workbench state into `valueTarget` and `insertTarget`; routed value-relative actions through `{ after: valueTarget }`; routed insertion actions through raw `insertTarget`; added clipboard snapshot and result call panels; added copy-to-insert and payload-insert actions. | Target clarity: 2 -> 4. State observability: 2 -> 4. Evidence: `apps/site/src/playgrounds/InterfaceWorkbench.playground.tsx`; `npm run typecheck -w @zod-crud/site` passed. |
| 002 | The docs explained each facade, but did not give a compact domain action layer that combines `can*`, patch, duplicate, selection-derived copy, paste targets, and history. That leaves LLMs and users to infer composition rules. | Added a `작업 레이어 예시` section to the site API doc with `addCard`, `duplicateCard`, `copySelectedCardsTo`, `pastePayloadAfter`, and `undo`, including raw insertion pointer vs `{ after }` wording. | LLM copyability: 3 -> 4. API correctness: 4 -> 4. Evidence: `apps/site/src/docs/zod-crud-api.md`; `npm run typecheck -w @zod-crud/site`, `npm test -w @zod-crud/site`, `npm run build -w @zod-crud/site`, and `git diff --check` passed. |
| 003 | The workbench target split needed a regression guard. Without a test, future UI cleanup could collapse value and insertion targets back into one ambiguous control. | Updated the site component test to require accessible `value target` and `insert target` controls and to execute the `copy to insert` flow. | Runtime health: 3 -> 4. Target clarity evidence: stronger. Evidence: `apps/site/tests/interface-workbench.test.tsx`; `npm run typecheck -w @zod-crud/site`, `npm test -w @zod-crud/site`, `npm run build -w @zod-crud/site`, and `git diff --check` passed. |

## Next Candidates

| Loop | Candidate |
| --- | --- |
| 004 | Add a visual/browser verification pass for workbench controls on desktop and mobile widths. |
| 005 | Make result calls more copyable by showing exact public method snippets for major actions. |
| 006 | Add a minimal JSONPath support note with one canonical query and one non-goal. |
| 007 | Tighten selection docs around multi-select sources and clipboard defaults. |
| 008 | Add docs examples for failed `canPastePayload` and schema rejection messages. |
| 009 | Score README, SPEC, site doc, and llms.txt consistency against the same paste target checklist. |
| 010 | Re-run blind LLM API test against only site docs and record pass/fail patterns. |
