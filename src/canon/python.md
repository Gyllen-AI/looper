Writing Python in a governed project. Nothing here is checked by the language, so
the law reads every edit: the bare `except`, the value answered for a failure,
the bare `Exception`, the mutable default, `assert`, `import *`, `# type: ignore`,
the string-built command and the stray print are all refused before you see them.

- **A caught error leaves through one of three doors: re-raised, returned to the
  caller, or logged and recovered from in the open.** There is no fourth door.
- **Logging is `observe/logging`.** Same rules in every language.
