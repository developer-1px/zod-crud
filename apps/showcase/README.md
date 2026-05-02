# zod-crud showcase

Visual test harness for the `zod-crud` library package.

The showcase behaves like a small editor rather than a package API surface. It
owns the demo schema, canvas/tree/table UI, command availability, keyboard
shortcuts, and focus recovery behavior.

## UX Logic

Command availability:

- Undo disabled when `canUndo()` is false.
- Redo disabled when `canRedo()` is false.
- Paste disabled when selected target's `canPaste(selectedId)` is not ok.
- Cut and Delete disabled for root.
- Create text/rect disabled when selected node has no insertion array.
- Update disabled when selected node has no editable text/name/label field.
- Keyboard shortcuts follow the same enabled/disabled rules as buttons.

Selection and focus recovery:

- After create/paste/update, focus changed or inserted visible nodes when
  possible.
- After delete/cut, recover to next sibling, previous sibling, visible parent,
  or root.
- Undo/redo should prefer visible domain nodes over hidden structural arrays
  such as `children`.
- Focus markers may show multiple changed ids, but `selected` should remain a
  visible, actionable node when possible.

Mobile/layout:

- Primary canvas should be reachable early on mobile.
- Expanded layer trees should be bounded and internally scrollable rather than
  pushing the entire editor far below the first viewport.
- Buttons and labels must not overflow their fixed controls.
