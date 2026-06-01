# De Facto Editing Feature Taxonomy

Tracking issue: https://github.com/developer-1px/zod-crud/issues/78

Status: external research note.

Purpose: collect editing/document features by feature vocabulary, not by product,
then judge whether the current `zod-crud` core primitives hold as an editing
document foundation.

## Method

The seed set covers document editors, spreadsheets, slides/object surfaces,
whiteboards, outliners, kanban/work tracking, CMS/form builders, and code/design
review tools.

Sources are official help centers, shortcut docs, product docs, or vendor
developer docs where possible. The classification is intentionally strict:
repeat across genres is not enough to enter core. A feature becomes a core-gap
candidate only when several independent extensions would need to recreate the
same product-neutral primitive.

Classification:

- `core-covered`: current `zod-crud` primitives can express the feature.
- `official/lab-covered`: an official package or lab already owns the feature.
- `lab-gap`: a small feature extension should pressure-test the feature.
- `app-owned`: product UI, geometry, rendering, permission, or workflow policy.
- `core-pressure`: not a core change yet, but repeated labs should watch it.

## External Evidence

- Google Docs and Word establish text document editing vocabulary: find/replace,
  comments, suggestions, track changes, accept/reject, and review navigation.
  Sources: Google Docs keyboard shortcuts, Google Docs suggestions, Microsoft
  Word keyboard shortcuts, Microsoft Word track changes.
- Google Sheets, Excel, and Airtable establish table/spreadsheet vocabulary:
  range selection, fill, sort, filter, validation/dropdowns, grouped records,
  duplicate records, and bulk operations.
  Sources: Google Sheets keyboard shortcuts, Google Sheets sort/filter, Google
  Sheets data validation, Excel shortcuts, Excel sort/filter, Excel fill,
  Airtable shortcuts.
- PowerPoint, Figma, FigJam, and Miro establish object-surface vocabulary:
  select, duplicate, group/ungroup, layer order, align/distribute, lock, comments,
  frames/groups, and object navigation.
  Sources: PowerPoint keyboard shortcuts, PowerPoint slide operations,
  PowerPoint group/ungroup, PowerPoint align/arrange, Figma groups/frames,
  Figma selection, Figma copy/paste, Figma align/distribute, FigJam grouping,
  Miro shortcuts.
- Workflowy, Logseq, Notion, and Obsidian establish outline/block vocabulary:
  block selection, duplicate, move, indent/outdent, collapse/expand, references,
  backlinks, and command-driven block conversion.
  Sources: Workflowy bullets/navigation, Notion shortcuts/comments, Logseq
  shortcuts, Obsidian editing shortcuts.
- Trello, Jira, Linear, GitHub review, Contentful, Webflow, and Typeform establish
  workflow/content vocabulary: status/label/assignee changes, filters, comments,
  references, validation, localization, publish/draft, suggested changes, and
  branching logic.
  Sources: Trello shortcuts, Jira shortcuts, Linear concepts/labels/relations,
  GitHub suggested changes, Contentful references/localization, Webflow CMS,
  Typeform branching logic.

## Feature-First Map

| Feature | Repeated genres | Current support | Verdict |
| --- | --- | --- | --- |
| Select target(s) | docs, sheets, object surfaces, outliners, kanban | core selection snapshots, pointers, read/query | core-covered; visual focus and hit testing stay app-owned |
| Insert/delete/replace | all genres | core `insert`, `delete`, `replace`, `patch`, `can*` | core-covered |
| Move/reorder | slides, sheets, kanban, outliners, object surfaces | core `move`; official `collection`; official/lab `outline`; labs `layer-order`, `move-selection` | official/lab-covered; `collection` owns single-item, `move-selection` owns contiguous block |
| Duplicate | docs, sheets, slides, Figma, Airtable, Notion | core `duplicate`; official `collection`; labs can specialize selection results | core-covered |
| Copy/cut/paste/import | all genres | core clipboard; official `clipboard-web`; official `snippets`; labs `drag-drop`, `paste-compatible`, `grid-paste` | official/lab-covered; `grid-paste` owns 2D matrix→rectangle mapping, distinct from `paste-compatible` payload-shape adaptation |
| Search/find/replace | docs, sheets, Notion, code review | core `find/query`; official `search-replace`, `bulk-edit` | official-covered |
| Sort/filter | sheets, Airtable, kanban, CMS, Linear/Jira | lab `collection-sort`; core query/read | sort covered; filter is mostly view-owned unless persisted as document state |
| Fill/propagate series | sheets, Airtable-like grids | lab `fill-series`; core patch can express it | lab-covered; constant fill + linear numeric series, host owns date/pattern series |
| Batch edit selected fields | Notion database, Airtable, Jira/Linear, CMS | official `bulk-edit`; core patch/canPatch | official-covered |
| Ensure object defaults | settings/config normalization, form init | lab `ensure-fields`; core read + canPatch | lab-covered; add missing keys only, additive complement to `fill-empty` |
| Forward-fill blanks | unmerge cleanup, pandas ffill, fill-down-blanks | lab `forward-fill`; core read + canPatch | lab-covered; carry neighbor value (down/up), distinct from `fill-empty` constant and `fill-series` series |
| Fill empty / default blanks | Sheets fill blanks, default missing values, data cleanup | lab `fill-empty`; core read + canPatch | lab-covered; conditional set (preserves non-empty), distinct from `batch-set` unconditional |
| Batch set field on selection | Notion/Airtable multi-select edit, Jira/Linear bulk | lab `batch-set`; official `bulk-edit`; core canPatch | lab-covered (selection-driven); `bulk-edit` is JSONPath query-driven, `batch-set` takes explicit selected pointers |
| Clear contents / reset field | sheets (Delete), forms, CMS, admin reset | lab `clear-values`; core schema introspection + replace | lab-covered; schema-derived empties, enum/object empties stay host policy via `emptyFor` |
| Join list to text | tag->csv, derived display fields, Sheets TEXTJOIN | lab `join-text`; core read + canPatch | lab-covered; inverse of `split-text`, locale formatting host-owned |
| Coerce field type | import cleanup, Sheets convert-to-number, data entry | lab `coerce`; core read + canPatch | lab-covered; only where schema accepts target type (union/coerce/unknown), strict fields rejected by canPatch |
| Split text to list | tag inputs, paste-as-list, Sheets split | lab `split-text`; core read + canPatch | lab-covered; delimiter split into 1D array, distinct from `grid-paste` 2D and full CSV parsing |
| Slugify title | CMS title->slug, blog permalinks | lab `slugify`; core read + canPatch | lab-covered; lowercase/diacritics/collapse; uniqueness and non-Latin transliteration host-owned |
| Pad string | zero-padded codes/IDs, fixed-width labels | lab `pad`; core read + canPatch | lab-covered; padStart/padEnd to min length, number formatting host-owned |
| Truncate text | excerpts/summaries, SEO meta description caps | lab `truncate`; core read + canPatch | lab-covered; stored cap with ellipsis/word-boundary, distinct from display-time truncation |
| Change case / trim text | docs change-case, sheets UPPER/LOWER/TRIM, CMS cleanup | lab `text-transform`; core read + canPatch | lab-covered; named transforms + host fn, schema string constraints enforced by canPatch |
| Round / snap number | currency 2dp, measurements, slider step snap | lab `round`; core read + canPatch | lab-covered; round/floor/ceil to precision or step, distinct from `number-step` increment |
| Increment / decrement number | quantity steppers, counters, ratings | lab `number-step`; core read + canPatch | lab-covered; +/- by step with optional clamp, schema range enforced by canPatch |
| Toggle set membership | tags, labels, multi-select chips | lab `set-membership`; core read + canPatch | lab-covered; toggle/add/remove a value in an array-as-set, host keyOf for objects |
| Toggle / cycle value | checkboxes, kanban status, select fields | lab `cycle`; core read + canPatch | lab-covered; boolean toggle from schema, enum order is host-supplied `values` |
| Reindex order field | Trello card positions, sortable lists, persisted drag order | lab `reindex`; core read + canPatch | lab-covered; sync position-as-order across the array, distinct from `fill-series` range fill |
| Swap two items | gallery reorder, A/B arrange, swap rows | lab `swap`; core read + canPatch | lab-covered; exchanges positions directly (two `move`s would shift indices) |
| Cap array length | recent-items lists, history rotation, keep-latest-N | lab `limit`; core read + canPatch | lab-covered; trim to N from start/end, schema minItems enforced by canPatch |
| Remove duplicates | sheets, Airtable, data cleanup | lab `dedupe`; core read + canPatch | lab-covered; keep-first by host key, distinct from `bulk-edit` JSONPath deletion |
| Group/ungroup | PowerPoint, Figma, FigJam, Miro | lab `grouping` | lab-covered; distinct from structural wrap/unwrap |
| Wrap/unwrap container | docs blocks, object frames, CMS sections | lab `wrap-unwrap` | lab-covered; feature differs from object grouping |
| Promote/demote | outliners, block editors, nested lists | official `outline` | official-covered |
| Collapse/expand | outliners, grouped records, toggles | app view state or host metadata | app-owned unless persisted; no core gap |
| Convert node/block kind | Notion blocks, CMS fields, Figma components, forms | lab `convert-node-kind` | lab-covered with host factory |
| Align/distribute | slides, Figma, Miro | lab `layer-order` covers z-order only | app-owned geometry; possible non-core `object-surface` outside zod-crud |
| Lock/protect/readonly | Figma/Miro lock, Sheets protected ranges, CMS permissions | official `protected-ranges`; schema validation | official-covered; permissions remain app-owned |
| Comments/mentions | docs, Notion, Figma, Miro, GitHub, Jira | official `comments`; lab `presence-cursors` | official/lab-covered |
| Suggested changes / review decisions | Google Docs, Word, GitHub review | official `proposed-changes` | official-covered; patch review, accept, and reject lifecycle |
| Draft/publish/checkpoint/autosave | CMS, Webflow, Contentful, docs | official `dirty-state`, `persist-web`, `patch-preview`; labs `autosave`, `checkpoints` | official/lab-covered |
| References/backlinks/relations | CMS references, Webflow references, Notion mentions, Linear relations, GitHub issues | labs `references`, `bookmarks`; core pointer/query | lab-covered; stable identity/reference index remains core-pressure watch |
| Validation/dropdowns/schema fields | sheets, forms, CMS | core schema validation/introspection; official `schema-form`; official `form-draft` | core/official-covered |
| Conditional logic/branching | Typeform, forms, CMS workflows | core patch/schema can store rules; lab `computed-fields` covers derived values | lab-gap only if rule graphs need reusable editing semantics |
| Document diff/preview/apply | review tools, CMS preview, migration flows | official `patch-preview`; lab `document-diff`; core patch/history | official/lab-covered |

## Core Pressure Findings

The external feature set does not justify an immediate core expansion. The
current core vocabulary remains the right center:

```text
zod-crud core
|-- JSON document state
|-- JSON Pointer
|-- JSON Patch
|-- schema validation/introspection
|-- document read/query
|-- can* capability
|-- commit/history
|-- headless selection
`-- headless clipboard
```

The strongest pressure is not a new app feature. It is repeated adapter logic
around how features normalize selected JSON Pointer targets.

```text
watchlist core pressure
|-- selected sibling normalization
|-- nested selection pruning
|-- contiguous range checks
|-- stable selectionAfter planning
|-- pointer vs stable identity references
`-- schema-described node factories
```

These should not enter core yet. They should be forced through small labs until
the same primitive appears in at least three independent feature packages.

## Lab Backlog

Completed pressure labs:

1. `proposed-changes` (#79)
   - Owns propose/accept/reject for schema-safe patch suggestions.
   - External pressure: Google Docs suggestions, Word track changes, GitHub
     suggested changes.
   - Core pressure: whether history metadata and patch preview are enough.

2. `references` (#80)
   - Owns schema-described stable references/backlinks over JSON documents.
   - External pressure: CMS references, Webflow reference fields, Notion mentions,
     Linear relations, GitHub issue links.
   - Core pressure: whether pointer tracking is enough or an identity descriptor
     primitive keeps reappearing.

3. `convert-node-kind` (#81)
   - Owns kind conversion with common field preservation and host factory.
   - External pressure: Notion block conversion, CMS field/content type changes,
     design component/frame conversion.
   - Core pressure: whether schema introspection is enough for safe conversion.

4. `wrap-unwrap`
   - Owns structural wrapping without object-surface grouping semantics.
   - External pressure: sections, frames, toggles, callouts, containers.

5. `paste-compatible`
   - Owns payload adaptation, ID remapping, and target compatibility diagnostics.
   - External pressure: slides copy/paste, Figma paste between containers,
     CMS/import payloads.

6. `fill-series` (#86)
   - Owns spreadsheet-like propagation across selected ranges: constant fill,
     linear numeric series, and a host generator for date/pattern series.
   - External pressure: Excel/Sheets fill down/right/series.
   - Core pressure: whether selected-sibling contiguous-range normalization keeps
     reappearing across structural extensions.

Priority 3:

7. `conditional-logic`
   - Owns editing rule graphs for branching forms.
   - External pressure: Typeform branching, CMS workflows, form builders.
   - Risk: may be product-specific; keep lab-only until repeated.

8. `approval-gated-edits`
   - Owns guarded edit proposals where a direct edit becomes a suggestion.
   - External pressure: protected ranges, document review, CMS approval flows.
   - Risk: may compose `protected-ranges` + `suggestions` instead of needing a
     package.

## Result

No core change is recommended now.

The right next move is to add labs that deliberately stress core without
promoting new concepts:

```text
external de facto features
`-- feature-first lab pressure
    `-- repeated implementation pain
        `-- strict core candidate
```

If `suggestions`, `references`, and `convert-node-kind` all reimplement the same
selection normalization or stable identity primitive, that evidence should open
a focused core RFC. Until then, keep core stable.

## Source Links

- Google Docs keyboard shortcuts: https://support.google.com/docs/answer/179738
- Google Docs suggest edits: https://support.google.com/docs/answer/6033474
- Microsoft Word keyboard shortcuts: https://support.microsoft.com/office/keyboard-shortcuts-in-word-95ef89dd-7142-4b50-afb2-f762f663ceb2
- Microsoft Word track changes: https://support.microsoft.com/office/track-changes-in-word-197ba630-0f5f-4a8e-9a77-3712475e806a
- Google Sheets keyboard shortcuts: https://support.google.com/docs/answer/181110
- Google Sheets sort/filter: https://support.google.com/docs/answer/3540681
- Google Sheets data validation/dropdowns: https://support.google.com/docs/answer/186103
- Microsoft Excel keyboard shortcuts: https://support.microsoft.com/office/keyboard-shortcuts-in-excel-1798d9d5-842a-42b8-9c99-9b7213f0040f
- Microsoft Excel sort/filter: https://support.microsoft.com/office/reapply-a-filter-and-sort-or-clear-a-filter-a46f7534-ce5c-4e20-ac9b-e35eec1c48c0
- Microsoft Excel fill: https://support.microsoft.com/office/fill-data-automatically-in-worksheet-cells-74e31bdd-d993-45da-aa82-35a236c5b5db
- Airtable keyboard shortcuts: https://support.airtable.com/docs/airtable-keyboard-shortcuts
- PowerPoint keyboard shortcuts: https://support.microsoft.com/office/use-keyboard-shortcuts-to-create-powerpoint-presentations-ebb3d20e-dcd4-444f-a38e-bb5c5ed180f4
- PowerPoint slide operations: https://support.microsoft.com/office/add-rearrange-duplicate-and-delete-slides-in-powerpoint-e35a232d-3fd0-4ee1-abee-d7d4d6da92fc
- PowerPoint group/ungroup: https://support.microsoft.com/office/group-or-ungroup-shapes-pictures-or-other-objects-a7374c35-20fe-4e0a-9637-7de7d844724b
- PowerPoint align/arrange: https://support.microsoft.com/office/align-or-arrange-objects-bfd91078-2078-4b35-8672-f6270690b3b8
- Figma groups and frames: https://help.figma.com/hc/en-us/articles/360039832054-The-difference-between-frames-and-groups
- Figma select layers and objects: https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects
- Figma copy and paste: https://help.figma.com/hc/en-us/articles/4409078832791-Copy-and-paste-objects
- Figma align/distribute: https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-and-position
- FigJam grouping: https://help.figma.com/hc/en-us/articles/1500004414962-Group-objects-in-FigJam
- Miro shortcuts: https://help.miro.com/hc/en-us/articles/360017731033-Shortcuts-and-hotkeys
- Workflowy bullets: https://workflowy.com/help/bullets
- Workflowy navigation: https://workflowy.com/help/navigate-around
- Notion keyboard shortcuts: https://www.notion.com/help/keyboard-shortcuts
- Notion comments and mentions: https://www.notion.com/help/comments-mentions-and-reminders
- Logseq shortcuts: https://chrislasar.github.io/logseq-doc/docs/reference/shortcuts
- Obsidian editing shortcuts: https://help.obsidian.md/editing-shortcuts
- Trello keyboard shortcuts: https://support.atlassian.com/trello/docs/keyboard-shortcuts-in-trello/
- Jira keyboard shortcuts: https://support.atlassian.com/jira-core-cloud/docs/use-keyboard-shortcuts/
- Linear concepts: https://linear.app/docs/conceptual-model
- Linear labels: https://linear.app/docs/labels/
- Linear issue relations: https://linear.app/docs/issue-relations/
- GitHub suggested changes: https://docs.github.com/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/incorporating-feedback-in-your-pull-request
- Contentful references: https://www.contentful.com/help/references/navigating-and-validating-references/
- Contentful localization: https://www.contentful.com/help/localization/field-and-entry-localization/
- Webflow CMS collections: https://help.webflow.com/hc/en-us/articles/33961244391059-Manage-CMS-Collections
- Webflow CMS API concepts: https://developers.webflow.com/data/reference
- Typeform branching logic: https://help.typeform.com/hc/en-us/articles/36047433913364-Which-type-of-logic-should-I-use-and-where-can-I-find-it
