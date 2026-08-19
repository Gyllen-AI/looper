Being able to answer whether it is working.

- **Three answers, never two: working, broken, and could not be asked.** A check
  that cannot reach its subject returns nothing, nothing reads as silence, and
  silence reads as fine. The third answer is the one that stops an outage looking
  like health.
- **A verdict, not a dump.** Reading a log to decide costs the reader more than
  the answer is worth and lies by omission. Say the state and the number that
  decided it.
- **Every layer that can fail alone can be asked alone.** A system with one
  aggregate green light cannot tell you which half is gone.
- **A check that has never failed is either protecting something or is dead
  weight**, and nothing distinguishes them without its history. Keep the record.
- **The gap between a thing breaking and somebody knowing is the number that
  matters**, not the number of checks.
