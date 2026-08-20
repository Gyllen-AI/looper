What happens when something you depend on is down.

- **Degraded and lying are different, and the difference is visible.** A screen
  that cannot reach a service says so; one that shows the last value without
  saying it is old has lied.
- **A retry has a ceiling and a backoff.** Immediate infinite retry turns one
  sick service into two, and the second one is yours.
- **Absence is a state with a name.** A count that could not be fetched must not
  render as `0`.
- **A fallback that invents a value is worse than an error.** Defaults belong
  where settings are gathered, never at the point of failure.
- **Say what you will do when the dependency is gone, before you add it.**
- **An error propagates, crashes, or is observed. None of them vanish.**
