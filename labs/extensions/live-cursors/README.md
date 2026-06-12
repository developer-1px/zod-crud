# @interactive-os/json-document-live-cursors

Lab package for remote collaborator cursor and selection presence.

It verifies that collaboration presence can stay outside core while remote
selection coordinates still track local JSON structure changes.

## Scope

- Track remote collaborator cursor and selection anchors outside the document.
- Validate incoming anchors with the public document facade.
- Move remote anchors after local patch streams.
- Preserve shared headless selection coordinate shapes.

## Non-goals

- Realtime transport, identity, color policy, awareness timeout, CRDT/OT, UI,
  keyboard, or focus lifecycle.

## Friction report

- `doc.at(pointer)` validates incoming remote selection anchors.
- `doc.exists(pointer)` checks whether tracked anchors still address live state.
- `doc.subscribe(listener)` observes local patch streams.
- `trackPointer(pointer, applied)` moves remote anchors after structural edits.
- `SelectionPoint` and `SelectionRange` provide shared headless selection shape.
- No core plugin registry was needed.
- No internal imports were needed.
- CRDT/OT remapping remains outside core; this package only tracks coordinates
  against patches already applied to the local document.
