Writing and changing code once the shape is decided.

- **Fix the cause, not the symptom.** A fix that would be wrong if nothing had
  broken is not a fix.
- **A workaround you did not name as temporary is permanent.** Name it with the
  condition that removes it, or do not ship it.
- **No speculative abstraction.** One implementation does not need an interface.
- **Delete rather than keep.** Dead code, a flag nobody sets, a branch nobody
  takes: each must be proven dead before the next reader can move.
- **Change the file you were asked about, not the one beside it.**
