# Extension Package Doubt Audit

Date: 2026-05-28

Scope: official packages under `packages/*` and prototypes under
`labs/extensions/*`.

Lens:

```text
feature/concept extension
└─ keep when one editor concept or workflow is install-worthy

convenience wrapper
└─ remove when it mainly shortens public core calls
```

## Gate

An official extension must pass all checks:

| Gate | Keep only if |
| --- | --- |
| Concept | The name is an editor feature/concept, not an internal mechanism. |
| Size | The package owns one small workflow, not a broad product area. |
| Install reason | A downstream editor would install it for that one feature. |
| Core pressure | Keeping it outside core avoids policy, environment, or UI ownership. |
| Independence | It works without registering plugins or depending on other extensions. |

If a package mostly wraps `doc.at`, `doc.query`, `doc.selection`, `doc.subscribe`,
or `can*` in a thinner shape, it is a recipe candidate, not an official package.

## Removed

| Package | Previous location | Judgment | Reason |
| --- | --- | --- | --- |
| `@zod-crud/record-index` | `packages/record-index` | Remove official | Stable id-to-pointer lookup is a convenience projection over `query` and `at`, not a user-facing feature package. |
| `@zod-crud/selection-model` | `packages/selection-model` | Remove official | It wraps core `doc.selection` into app snapshot shape; core selection is already the concept. |
| `@zod-crud/query-watch` | `packages/query-watch` | Remove official | It is a derived read subscription helper over `query`, `at`, and `subscribe`; useful as a recipe, weak as a feature package. |
| `@zod-crud/active-pointer` | `labs/extensions/active-pointer` | Remove lab | Active pointer is view-local focus plumbing, not a package-level editor feature. |
| `@zod-crud/command-state` | `labs/extensions/command-state` | Remove lab | Command enabled state is host command-layer projection over `can*` probes. |
| `@zod-crud/expansion-state` | `labs/extensions/expansion-state` | Remove lab | Outline expansion is view-local state; keep outline as the concept instead. |
| `@zod-crud/value-factory` | `labs/extensions/value-factory` | Remove lab | Factory/default creation is host policy unless it becomes a named concept such as templates. |
| `@zod-crud/list-ops` | `labs/extensions/list-ops` | Remove lab | Predecessor to official `@zod-crud/collection`; duplicate inventory. |
| `@zod-crud/bulk-edit` lab | `labs/extensions/bulk-edit` | Remove lab | Official package exists; predecessor pressure no longer needs a lab package. |
| `@zod-crud/dirty-state` lab | `labs/extensions/dirty-state` | Remove lab | Official package exists; predecessor pressure no longer needs a lab package. |
| `@zod-crud/patch-log` lab | `labs/extensions/patch-log` | Remove lab | Official package exists; predecessor pressure no longer needs a lab package. |
| `@zod-crud/persist-web` lab | `labs/extensions/persist-web` | Remove lab | Official package exists; predecessor pressure no longer needs a lab package. |
| `@zod-crud/schema-form` lab | `labs/extensions/schema-form` | Remove lab | Official package exists; predecessor pressure no longer needs a lab package. |
| `@zod-crud/record-index` lab | `labs/extensions/record-index` | Remove lab | Same convenience judgment as removed official package. |
| `@zod-crud/selection-model` lab | `labs/extensions/selection-model` | Remove lab | Same convenience judgment as removed official package. |
| `@zod-crud/query-watch` lab | `labs/extensions/query-watch` | Remove lab | Same convenience judgment as removed official package. |

## Kept

| Package | Location | Judgment | Reason |
| --- | --- | --- | --- |
| `@zod-crud/clipboard-web` | `packages/clipboard-web` | Keep official | Environment bridge to browser clipboard; not core responsibility. |
| `@zod-crud/collection` | `packages/collection` | Keep official | Ordered array item editing is one reusable editor workflow. |
| `@zod-crud/schema-form` | `packages/schema-form` | Keep official | Form field descriptors are an editor concept, not just a helper. |
| `@zod-crud/dirty-state` | `packages/dirty-state` | Keep official | Dirty baseline is a common save workflow concept. |
| `@zod-crud/bulk-edit` | `packages/bulk-edit` | Keep official | Replace-all/delete-all is a command-grade editing feature. |
| `@zod-crud/patch-log` | `packages/patch-log` | Keep official | Recording/replay is a distinct audit/debug workflow. |
| `@zod-crud/persist-web` | `packages/persist-web` | Keep official | Browser persistence is an environment bridge. |
| `@zod-crud/annotations` | `labs/extensions/annotations` | Keep lab | Comments/review anchors are a small editor concept. |
| `@zod-crud/autosave` | `labs/extensions/autosave` | Keep lab | Autosave is one install-worthy workflow. |
| `@zod-crud/checkpoints` | `labs/extensions/checkpoints` | Keep lab | Named snapshots are one editor workflow. |
| `@zod-crud/collection-sort` | `labs/extensions/collection-sort` | Keep lab | Sorting an ordered collection is one focused feature. |
| `@zod-crud/computed-fields` | `labs/extensions/computed-fields` | Keep lab | Derived/formula fields are a recognizable editor concept. |
| `@zod-crud/document-diff` | `labs/extensions/document-diff` | Keep lab | Compare/apply-target is a distinct import/reconcile workflow. |
| `@zod-crud/document-outline` | `labs/extensions/document-outline` | Keep lab | Outline is a recognizable document navigation concept. |
| `@zod-crud/drop-intent` | `labs/extensions/drop-intent` | Keep lab, rename later | Drag/drop is a feature concept; current name is implementation-shaped. |
| `@zod-crud/field-draft` | `labs/extensions/field-draft` | Keep lab, rename later | Form draft input is a focused workflow, but naming should become feature-sized. |
| `@zod-crud/patch-preview` | `labs/extensions/patch-preview` | Keep lab | Preview before applying changes is one editor workflow. |
| `@zod-crud/pointer-bookmarks` | `labs/extensions/pointer-bookmarks` | Keep lab, rename later | Bookmarks are a feature concept; current name exposes Pointer implementation. |
| `@zod-crud/presence-cursors` | `labs/extensions/presence-cursors` | Keep lab | Presence cursors are a collaboration concept. |
| `@zod-crud/text-search` | `labs/extensions/text-search` | Keep lab | Search/replace is a common editor feature. |

## Before -> After

| Set | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Official extension packages | 10 | 7 | -3 |
| Lab extension packages | 26 | 13 | -13 |

Result: official packages now skew toward concept/feature extensions and
environment bridges. Convenience projections are removed instead of being
promoted as package concepts.
