Anything that would cost somebody if it got out.

- **A secret has one shape: fetched where it is used, never copied, never
  printed.** Not in a log line, not in an error message, not in a type that
  reaches a browser or a wire.
- **A copy goes stale and the staleness is silent.** A credential duplicated into
  a config file is correct until the day it is rotated, and then every call fails
  with a message about the transport rather than the credential.
- **A secret that reached the history is not fixed by a later commit.** Every
  clone already has it. Change it at whoever issued it, then remove it, in that
  order, because the second step alone does nothing.
- **It never enters argv.** A process list is readable by every user on the box.
  Pass it in the environment or on a pipe.
- **When a scanner fires on something legitimate, fix the pattern.** Widening what
  it allows to make one commit pass turns every future leak into a thing nobody
  hears about.
