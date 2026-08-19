Writing Python in a governed project. Nothing here is checked by the language
itself: a file with a typo in it runs until that line is reached, so these are
the failures no interpreter will ever mention.

- A caught error leaves through one of three doors: re-raised, returned to the
  caller, or logged and recovered from in the open. `except: pass` deletes the
  evidence, and a bare `except:` swallows the interrupt someone pressed to stop
  the program.
- Never answer a failure with a made-up value. `return None`, `return []`,
  `return ""` inside an `except` turn a broken call into data nothing can tell
  from a real answer one line later.
- An error is a class of your own, one per failure. `raise Exception("...")`
  names nothing, so the only way to catch it is `except Exception`, which
  catches everything else at the same time.
- `assert` is not a check. `python -O` deletes it, so a validation written with
  one passes every test and is absent where it runs. `if not ok: raise` survives.
- A default argument is built once, at definition. `def f(items=[])` hands every
  caller the same list. `None` and a line inside the body is the whole fix.
- Do not silence the checker. `# type: ignore` is that line's annotation quietly
  ceasing to be true while still reading as though it were.
- `from x import *` takes every name without saying which, so nothing can tell
  where a name came from and adding one upstream can break this file untouched.
- No comments, for the reason every language here has: names, types and tests
  cannot drift out of date, and prose can.
- **Logging is `observe/logging`.** Same rules in every language, kept in one place.
