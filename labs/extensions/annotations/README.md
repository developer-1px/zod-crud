# @zod-crud/annotations

Lab package for headless comment/review annotations anchored to JSON Pointers.

It verifies that an editor can keep annotation state outside core while tracking
anchors through document edits with the public facade.

Public API pressure used:

- `doc.at(pointer)` validates anchors before storing them.
- `doc.exists(pointer)` confirms tracked anchors still address live state.
- `doc.subscribe(listener)` observes applied patch streams.
- `trackPointer(pointer, applied)` moves anchors after insert/delete/move.

Friction report:

- No core plugin registry was needed.
- No internal imports were needed.
- Annotation identity, text, status, author data, and collaboration policy stay
  host-owned.
- Lost-anchor recovery is product policy and should remain outside core.
