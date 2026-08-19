More than one thing happening at once.

- **Read-modify-write across a network is a race.** Two callers read the same
  value, both add one, one increment is gone. Push the arithmetic to where the
  data is, or take a lock with a version number.
- **A lock is held for the work, never across a call you do not control.** Any
  lock spanning an HTTP request is held for as long as somebody else's server
  chooses.
- **Shared mutable state is named and owned by one thing.** Two writers with no
  agreement is not a design, and the bug it produces appears under load and never
  in a test.
- **A queue with no bound is memory with extra steps.** Say the depth, and say
  what happens when it is full: refusing is a decision, filling until the process
  dies is not.
- **A background task that can fail silently will.** Its failures leave through
  the same three doors as everything else: passed on, stopped, or written down.
