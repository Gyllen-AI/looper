Anything that would cost somebody if it got out.

- **A secret has one shape: fetched where it is used, never copied, never
  printed.** Not in a log line, an error message, or a type that reaches a
  browser or a wire.
- **A copy goes stale and the staleness is silent:** correct until the rotation,
  then every call fails with a message about the transport.
- **A secret that reached the history is not fixed by a later commit.** Rotate
  it at whoever issued it, then remove it, in that order.
- **It never enters argv.** A process list is readable by every user on the box;
  use the environment or a pipe.
- **When a scanner fires on something legitimate, fix the pattern.** Widening
  the allowlist for one commit silences every future leak.
