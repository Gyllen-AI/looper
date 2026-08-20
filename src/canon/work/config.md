Settings, and where a default is allowed to live.

- **Defaults live in one file and nowhere else.** A value invented at the point
  of use means two places answer "what if nobody said".
- **A setting that changes behaviour is named in the record**, not discovered by
  reading code.
- **A saved setting beats a default, so changing the default changes nothing for
  anyone already running.** Switching something on takes both places, and the
  running program's own report is the check.
- **Configuration is validated at start, not at first use.**
- **The environment is not a secret store, but it is where a secret is handed
  over.** Neither fact excuses printing it.
