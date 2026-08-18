Writing TypeScript in a governed project. This language lets a failure disappear
without a warning from anything. These are rules, not preferences.

- A caught error leaves through one of three doors: rethrown, returned to the
  caller, or logged and recovered from in the open. There is no fourth door. An
  empty `catch` and a `.catch(() => {})` both delete the evidence.
- Never answer a failure with a value. `catch { return null }`, `return []`,
  `return {}` and `.catch(() => 0)` turn a broken call into data that looks real
  one line later, and the wrong answer surfaces three layers from its cause.
- Every call that finishes later is awaited, or its failure is handled on
  purpose. A promise nobody waits for fails in silence.
- Do not tell the compiler to trust you. `as`, `as unknown as`, `!` and `any`
  each turn a check into an assumption. Validate the value at the edge where it
  enters, then the type is earned rather than claimed.
- No comments. Names, types and tests carry the meaning, and they are the parts
  that cannot quietly drift out of date. Reasons go in the commit message, longer
  explanations in a document beside the code. One exception, because a program
  reads it and it cannot go stale: `looper:allow-secret` after code on the line.
- Nothing from outside is pasted into a query, a shell command or a page the
  browser sees, and nothing is used before it is checked. Whoever sent it chose
  what it says. A parameter, an argument array and a schema at the edge are all
  shorter to write than the spelling that gets you robbed.
- If a rule blocks you and its suggestions do not work, looper is wrong, not
  you. Do not switch it off, and do not hand the command to a person to run
  instead — the same rules judge their commit. Run `looper report`, which writes
  the shape it fired on and nothing else of yours, for a human to read first.
  Rules are meant to be argued with: say so once and point at CONTRIBUTING.md.
