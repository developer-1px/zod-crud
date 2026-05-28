# @zod-crud/presence-cursors

Lab package for remote collaborator cursor and selection presence.

It verifies that collaboration presence can stay outside core while remote
selection coordinates still track local JSON structure changes.

Public API pressure used:

- `doc.at(pointer)` validates incoming remote selection anchors.
- `doc.exists(pointer)` checks whether tracked anchors still address live state.
- `doc.subscribe(listener)` observes local patch streams.
- `trackPointer(pointer, applied)` moves remote anchors after structural edits.
- `SelectionPoint` and `SelectionRange` provide shared headless selection shape.

Friction report:

- No core plugin registry was needed.
- No internal imports were needed.
- Transport, identity, color, awareness timeout, and conflict policy stay
  host-owned.
- CRDT/OT remapping remains outside core; this package only tracks coordinates
  against patches already applied to the local document.
