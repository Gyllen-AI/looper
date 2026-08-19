Settings, and where a default is allowed to live.

- **Defaults live in one file and nowhere else.** A value invented at the point
  of use means two places answer "what if nobody said", and nobody can say what
  the program does when the value is missing.
- **A setting that changes behaviour is named in the record**, not discovered by
  reading code. Anything that can turn a feature off is a documented decision.
- **A saved setting beats a default, so changing the default changes nothing for
  anyone already running.** Switching something on takes both places, and the
  running program's own report is the check.
- **Configuration is validated at start, not at first use.** A missing value that
  surfaces an hour later surfaces during the thing it was needed for.
- **The environment is not a secret store**, but it is where a secret is handed
  over. Neither fact excuses printing it.
