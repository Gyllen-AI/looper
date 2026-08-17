Modules, boundaries, storage, and anything crossing between them.

- **State has one home and that home is the truth.** No second copy, no cache to
  reconcile: every read is answered from the home. Anything kept in memory
  between requests is written down first — what it is, why it cannot be a query,
  when it is flushed, what dies with the process.
- **Absence is not an answer.** A value nobody gave you is not a value someone
  set to off. Treating them alike lies in a way that looks like data: store the
  difference from a default, or name the third state, but never let unknown
  collapse into no.
- **A component that refuses to act still has to say so.** A silent refusal and
  a silent success are the same thing from outside.
- **What crosses a boundary is defined once**, where both sides import it, and
  parsed at the edge into a type that means something. A bare string crossing is
  a decision to check it later, which means nowhere.
- **What a person looks at renders what it is told and decides nothing.** Policy
  and truth live behind it, a preference and a toggle included. It may hide a
  control; it never decides.
