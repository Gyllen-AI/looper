Modules, boundaries, storage, and anything crossing between them.

- **State has one home and that home is the truth.** No second copy and no cache
  to reconcile. Anything held in memory between requests is written down: what it
  is, why it cannot be a query, when it flushes, what dies with the process.
- **Absence is not an answer.** A value nobody gave is not a value set to off.
  Store the difference from a default, or name the third state.
- **A component that refuses to act says so.** A silent refusal and a silent
  success look the same from outside.
- **What crosses a boundary is defined once**, where both sides import it, and
  parsed at the edge into a type that means something.
- **What a person looks at renders what it is told and decides nothing**, a
  preference and a toggle included. It may hide a control; it never decides.
