# @zod-crud/expansion-state

Lab package for headless outline/tree expanded-state tracking.

It verifies that editors can keep collapsed/expanded view state outside core
while still following JSON structure edits through public document patches.

Public API pressure used:

- `doc.entries(pointer)` validates whether a pointer can be expanded.
- `doc.exists(pointer)` checks whether tracked expansion paths still address live
  state.
- `doc.subscribe(listener)` observes applied patch streams.
- `trackPointer(pointer, applied)` moves expanded paths after structural edits.

Friction report:

- No core plugin registry was needed.
- No internal imports were needed.
- View policy, disclosure UI, lazy loading, and persisted user preferences stay
  host-owned.
- Core does not need an "expanded" concept; Pointers and patch tracking were
  enough.
