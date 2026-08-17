Handling anything that would cost somebody if it got out.

- **A secret has one shape: fetched where it is used, never copied, never
  printed.** Not in a log line, not in an error message, not in a type that
  reaches a browser or a wire. One in a log is an incident, not a bug.
- **A secret that reached the history is not fixed by a later commit.** Every
  clone already has it. Change the credential at whoever issued it, then remove
  it — in that order, because the second step alone does nothing.
- **When a gate fires on something legitimate, fix the pattern.** Widening what a
  scanner allows, to make one commit pass, turns every future leak into a thing
  nobody hears about.
