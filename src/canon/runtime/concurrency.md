More than one thing happening at once.

- **Read-modify-write across a network is a race.** Push the arithmetic to where
  the data is, or take a lock with a version number.
- **A lock is held for the work, never across a call you do not control.**
- **Shared mutable state is named and owned by one thing.** Two writers with no
  agreement is a bug that appears under load and never in a test.
- **A queue with no bound is memory with extra steps.** Say the depth and what
  happens when it is full: refusing is a decision, filling until the process dies
  is not.
- **A background task that can fail silently will.** Passed on, stopped, or
  written down, like every other failure.
