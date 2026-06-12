# De Facto Editing Feature Taxonomy

Tracking issue: https://github.com/developer-1px/json-document/issues/78

Status: external research note.

Purpose: collect editing/document features by feature vocabulary, not by product,
then judge whether the current `@interactive-os/json-document` core primitives hold as an editing
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

- `core-covered`: current `@interactive-os/json-document` primitives can express the feature.
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
| Move/reorder | slides, sheets, kanban, outliners, object surfaces | core `move`; official `collection`; official/lab `outline`; labs `layer-order`, `move-selected` | official/lab-covered; `collection` owns single-item, `move-selected` owns contiguous block |
| Duplicate | docs, sheets, slides, Figma, Airtable, Notion | core `duplicate`; official `collection`; labs can specialize selection results | core-covered |
| Copy/cut/paste/import | all genres | core clipboard; official `clipboard-web`; official `snippets`; labs `drag-drop`, `paste-special`, `paste-cells` | official/lab-covered; `paste-cells` owns 2D matrix→rectangle mapping, distinct from `paste-special` payload-shape adaptation |
| Search/find/replace | docs, sheets, Notion, code review | core `find/query`; official `search-replace`, `bulk-edit` | official-covered |
| Sort/filter | sheets, Airtable, kanban, CMS, Linear/Jira | lab `sort-items`; core query/read | sort covered; filter is mostly view-owned unless persisted as document state |
| Fill/propagate series | sheets, Airtable-like grids | lab `fill-series`; core patch can express it | lab-covered; constant fill + linear numeric series, host owns date/pattern series |
| Batch edit selected fields | Notion database, Airtable, Jira/Linear, CMS | official `bulk-edit`; core patch/canPatch | official-covered |
| Ensure object defaults | settings/config normalization, form init | lab `apply-defaults`; core read + canPatch | lab-covered; add missing keys only, additive complement to `fill-blanks` |
| Forward-fill blanks | unmerge cleanup, pandas ffill, fill-down-blanks | lab `fill-down`; core read + canPatch | lab-covered; carry neighbor value (down/up), distinct from `fill-blanks` constant and `fill-series` series |
| Fill empty / default blanks | Sheets fill blanks, default missing values, data cleanup | lab `fill-blanks`; core read + canPatch | lab-covered; conditional set (preserves non-empty), distinct from `batch-update` unconditional |
| Batch set field on selection | Notion/Airtable multi-select edit, Jira/Linear bulk | lab `batch-update`; official `bulk-edit`; core canPatch | lab-covered (selection-driven); `bulk-edit` is JSONPath query-driven, `batch-update` takes explicit selected pointers |
| Clear contents / reset field | sheets (Delete), forms, CMS, admin reset | lab `clear-contents`; core schema introspection + replace | lab-covered; schema-derived empties, enum/object empties stay host policy via `emptyFor` |
| Join list to text | tag->csv, derived display fields, Sheets TEXTJOIN | lab `join-text`; core read + canPatch | lab-covered; inverse of `split-text`, locale formatting host-owned |
| Convert field type | import cleanup, Sheets convert-to-number, data entry | lab `convert-type`; core read + canPatch | lab-covered; only where schema accepts the target type, strict fields rejected by canPatch |
| Split text to list | tag inputs, paste-as-list, Sheets split | lab `split-text`; core read + canPatch | lab-covered; delimiter split into 1D array, distinct from `paste-cells` 2D and full CSV parsing |
| Generate slug | CMS title->slug, blog permalinks | lab `generate-slug`; core read + canPatch | lab-covered; lowercase/diacritics/collapse; uniqueness and non-Latin transliteration host-owned |
| Pad text | zero-padded codes/IDs, fixed-width labels | lab `pad-text`; core read + canPatch | lab-covered; padStart/padEnd to min length, number formatting host-owned |
| Trim text | excerpts/summaries, SEO meta description caps | lab `trim-text`; core read + canPatch | lab-covered; stored cap with ellipsis/word-boundary, distinct from display-time truncation |
| Change case / trim text | docs change-case, sheets UPPER/LOWER/TRIM, CMS cleanup | lab `change-case`; core read + canPatch | lab-covered; named transforms + host fn, schema string constraints enforced by canPatch |
| Round / snap number | currency 2dp, measurements, slider step snap | lab `round`; core read + canPatch | lab-covered; round/floor/ceil to precision or step, distinct from `increment-number` increment |
| Increment / decrement number | quantity steppers, counters, ratings | lab `increment-number`; core read + canPatch | lab-covered; +/- by step with optional clamp, schema range enforced by canPatch |
| Toggle set membership | tags, labels, multi-select chips | lab `toggle-option`; core read + canPatch | lab-covered; toggle/add/remove a value in an array-as-set, host keyOf for objects |
| Toggle value | checkboxes, kanban status, select fields | lab `toggle-value`; core read + canPatch | lab-covered; boolean toggle and schema-derived enum/literal values; host `values` override order |
| Renumber order field | Trello card positions, sortable lists, persisted drag order | lab `renumber-items`; core read + canPatch | lab-covered; sync position-as-order across the array, distinct from `fill-series` range fill |
| Swap two items | gallery reorder, A/B arrange, swap rows | lab `swap-items`; core read + canPatch | lab-covered; exchanges positions directly (two `move`s would shift indices) |
| Limit item count | recent-items lists, history rotation, keep-latest-N | lab `limit-items`; core read + canPatch | lab-covered; trim to N from start/end, schema minItems enforced by canPatch |
| Remove duplicates | sheets, Airtable, data cleanup | lab `dedupe`; core read + canPatch | lab-covered; keep-first by host key, distinct from `bulk-edit` JSONPath deletion |
| Group/ungroup | PowerPoint, Figma, FigJam, Miro | lab `grouping` | lab-covered; distinct from structural wrap/unwrap |
| Wrap/unwrap container | docs blocks, object frames, CMS sections | lab `wrap-selection` | lab-covered; feature differs from object grouping |
| Promote/demote | outliners, block editors, nested lists | official `outline` | official-covered |
| Collapse/expand | outliners, grouped records, toggles | app view state or host metadata | app-owned unless persisted; no core gap |
| Convert node/block kind | Notion blocks, CMS fields, Figma components, forms | lab `convert-block-type` | lab-covered with host factory |
| Align/distribute | slides, Figma, Miro | lab `layer-order` covers z-order only | app-owned geometry; possible non-core `object-surface` outside json-document |
| Lock/protect/readonly | Figma/Miro lock, Sheets protected ranges, CMS permissions | official `protected-ranges`; schema validation | official-covered; permissions remain app-owned |
| Comments/mentions | docs, Notion, Figma, Miro, GitHub, Jira | official `comments`; lab `live-cursors` | official/lab-covered |
| Suggested changes / review decisions | Google Docs, Word, GitHub review | official `proposed-changes` | official-covered; patch review, accept, and reject lifecycle |
| Draft/publish/checkpoint/autosave | CMS, Webflow, Contentful, docs | official `dirty-state`, `persist-web`, `patch-preview`; labs `autosave`, `checkpoints` | official/lab-covered |
| References/backlinks/relations | CMS references, Webflow references, Notion mentions, Linear relations, GitHub issues | labs `references`, `bookmarks`; core pointer/query | lab-covered; stable identity/reference index remains core-pressure watch |
| Validation/dropdowns/schema fields | sheets, forms, CMS | core schema validation/introspection; official `schema-form`; official `form-draft` | core/official-covered |
| Conditional logic/branching | Typeform, forms, CMS workflows | core patch/schema can store rules; lab `calculated-fields` covers derived values | lab-gap only if rule graphs need reusable editing semantics |
| Document diff/preview/apply | review tools, CMS preview, migration flows | official `patch-preview`; lab `document-diff`; core patch/history | official/lab-covered |

## Lab Naming External Audit

2026-06-01 external naming audit. The question here is not whether a lab is
official enough to promote. It is whether the package name reads like a reusable
editor command or feature instead of an implementation detail.

Naming decision: prefer names that are frequently used or commonly called by
editing tools. The target is a command/feature name that a developer can hear
once and recognize without reading the source. A familiar product word beats a
technically precise but uncommon implementation word.

Subagent lanes:

- Spreadsheet/data editors: Excel, Google Sheets, Airtable, Power Query.
- Docs/CMS/block editors: Word, Google Docs, Notion, WordPress, Contentful.
- Object/design editors: Figma, PowerPoint, Miro, Canva.

Verdict key:

- `strong`: current name or a close variant is recognizable external editor
  vocabulary.
- `understandable`: the feature is externally recognizable, but the current
  name is less product-facing than the common command label.
- `weak/misleading`: the feature can still be reusable, but the current name
  reads too internal, too broad, or unlike editor command vocabulary.

| Previous lab name | Package name now | Common editor vocabulary | Decision |
| --- | --- | --- | --- |
| `batch-set` | `batch-update` | batch update, bulk update | Renamed to the more common data-tool command. |
| `clear-values` | `clear-contents` | Clear Contents | Renamed to the spreadsheet/menu label. |
| `coerce` | `convert-type` | convert/change data type | Renamed away from developer vocabulary. |
| `collection-sort` | `sort-items` | sort items/records/range | Renamed to put the command first. |
| `computed-fields` | `calculated-fields` | calculated field, formula field | Renamed to the product-facing field concept. |
| `convert-node-kind` | `convert-block-type` | convert block type, transform to | Renamed away from internal node/kind vocabulary. |
| `cycle` | `toggle-value` | toggle, next value/status | Renamed so the target is explicit. |
| `ensure-fields` | `apply-defaults` | apply defaults | Renamed away from implementation vocabulary. |
| `fill-empty` | `fill-blanks` | fill blanks | Renamed to the common spreadsheet/data-cleanup phrase. |
| `forward-fill` | `fill-down` | Fill Down | Renamed to the familiar data-tool command. |
| `grid-paste` | `paste-cells` | paste cells | Renamed to the visible editing action. |
| `limit` | `limit-items` | limit/keep items | Renamed so the object is explicit. |
| `move-selection` | `move-selected` | move selected items/objects | Renamed toward command wording. |
| `number-step` | `increment-number` | increment/decrement number | Renamed to the common numeric command. |
| `pad` | `pad-text` | pad text, zero-pad | Renamed so the target is explicit. |
| `paste-compatible` | `paste-special` | Paste Special, paste as | Renamed from adapter quality to command name. |
| `presence-cursors` | `live-cursors` | live cursors, collaborator pointers | Renamed to collaborative editor vocabulary. |
| `reindex` | `renumber-items` | renumber items, add index | Renamed away from database/search vocabulary. |
| `set-membership` | `toggle-option` | toggle option, multi-select | Renamed away from mathematical vocabulary. |
| `slugify` | `generate-slug` | generate slug | Renamed from helper verb to command label. |
| `swap` | `swap-items` | swap items/positions | Renamed so the object is explicit. |
| `text-transform` | `change-case` | Change Case | Renamed to the common editor command for the built-in transforms. |
| `truncate` | `trim-text` | trim text, character limit | Renamed away from developer vocabulary. |
| `wrap-unwrap` | `wrap-selection` | wrap selection, unwrap container | Renamed toward command wording. |

Kept as-is because the current names are already common editor feature vocabulary:

`autosave`, `bookmarks`, `checkpoints`, `dedupe`, `drag-drop`,
`fill-series`, `grouping`, `join-text`, `layer-order`, `references`,
`round`, and `split-text`.

Naming conclusion:

```txt
lab naming state
|-- strong external vocabulary: keep name unless API scope changes
|-- understandable vocabulary: keep in lab, improve toward common command label
`-- weak/misleading vocabulary: feature may be valid, but rename before promotion
```

The rename pass keeps the feature set intact while making the package names feel like familiar editor commands rather than library internals.

## Core Pressure Findings

The external feature set does not justify an immediate core expansion. The
current core vocabulary remains the right center:

```text
json-document core
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

3. `convert-block-type` (#81)
   - Owns kind conversion with common field preservation and host factory.
   - External pressure: Notion block conversion, CMS field/content type changes,
     design component/frame conversion.
   - Core pressure: whether schema introspection is enough for safe conversion.

4. `wrap-selection`
   - Owns structural wrapping without object-surface grouping semantics.
   - External pressure: sections, frames, toggles, callouts, containers.

5. `paste-special`
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

If `suggestions`, `references`, and `convert-block-type` all reimplement the same
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
- Contentful reference fields: https://www.contentful.com/help/references/
- Contentful localization: https://www.contentful.com/help/localization/field-and-entry-localization/
- Webflow CMS collections: https://help.webflow.com/hc/en-us/articles/33961244391059-Manage-CMS-Collections
- Webflow CMS API concepts: https://developers.webflow.com/data/reference
- Typeform branching logic: https://help.typeform.com/hc/en-us/articles/36047433913364-Which-type-of-logic-should-I-use-and-where-can-I-find-it
- Microsoft Excel clear contents: https://support.microsoft.com/en-us/office/clear-cells-of-contents-or-formats-9ff6b8ff-1afd-495f-8ad8-8c1f6f82a9d6
- Microsoft AutoSave: https://support.microsoft.com/en-us/office/what-is-autosave-6d6bd723-ebfd-4e40-b5f6-ae6e8088f7a5
- Microsoft Word Paste Special: https://support.microsoft.com/en-gb/office/paste-special-e03db6c7-8295-4529-957d-16ac8a778719
- Microsoft Word Change Case: https://support.microsoft.com/en-gb/office/change-the-capitalization-or-case-of-text-1d86cf80-fbef-4380-8d6f-59a6b77db749
- Google Docs links and bookmarks: https://support.google.com/docs/answer/45893
- Google Sheets split text/remove duplicates/trim whitespace: https://support.google.com/docs/answer/6325535
- Google Sheets autofill series: https://support.google.com/docs/answer/75509
- Figma version history/checkpoints: https://help.figma.com/hc/en-us/articles/360038006754-View-a-file-s-version-history
- Figma layers: https://help.figma.com/hc/en-us/articles/26584819173271-Layers-101-Get-started-with-layers
- Microsoft PowerPoint layer objects: https://support.microsoft.com/en-au/office/layer-objects-on-slides-81cccf31-9219-4c89-b7ba-9f25ad429c4a
- Microsoft PowerPoint slide bookmarks: https://support.microsoft.com/en-au/office/bookmark-a-slide-and-link-to-it-from-elsewhere-in-the-presentation-f4d4b309-90ef-4df0-bd1c-f75e47bbd71a
- WordPress Classic block convert to blocks: https://wordpress.org/documentation/article/classic-block/
- Airtable Batch update extension: https://support.airtable.com/docs/batch-update-extension
- Airtable Dedupe extension: https://support.airtable.com/docs/dedupe-extension
