Writing and changing code once the shape is decided.

- **Fix the cause, not the symptom.** A fix that would be wrong if nothing had
  broken is not a fix.
- **A workaround you did not name as temporary is permanent.** Name it in the
  open with the condition that removes it, or do not ship it.
- **No speculative abstraction.** The simplest thing that works, and nothing for
  a problem that has not happened. One implementation does not need an interface.
- **Delete rather than keep.** Dead code, a flag nobody sets, a branch nobody
  takes: each is a thing the next reader has to prove is dead before they can
  move.
- **Change the file you were asked about, and not the one beside it.** A drive-by
  rewrite hides the change somebody has to review.
