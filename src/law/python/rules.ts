import type { Rule } from "../rule.ts";

export const PYTHON_RULES: readonly Rule[] = [
  {
    id: "PY-ERROR:1",
    category: "ERROR",
    pass: "fast",
    bans: "a bare `except:`, and an `except` whose body does nothing — `pass` or `...`",
    why:
      "a caught error leaves through one of three doors: rethrown, returned to the caller, or logged and recovered from in the open. `except: pass` deletes the evidence that anything went wrong, and the wrong answer surfaces three layers from its cause. A bare `except:` is worse again, because it also swallows the interrupt someone pressed to stop the program",
    instead: [
      "name what is being ignored and it stops being a silence: `with suppress(FileNotFoundError): ...`",
      "log it and carry on: `logger.warning(\"could not read %s\", path, exc_info=True)`",
      "re-raise it as something the caller can act on, keeping the cause: `raise Missing(path) from error`",
      "`except OSError:` rather than `except:` — a bare one catches KeyboardInterrupt and SystemExit too",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-TRUTH:1",
    category: "TRUTH",
    pass: "fast",
    bans: "a default argument that is a mutable container — `[]`, `{}`, `set()`, `list()`, `dict()`",
    why:
      "the default is built once, when the function is defined, not each time it is called. Every caller that leaves the argument out is handed the same list, so one call's append is still there on the next call, and the wrong answer appears far from the line that caused it. It reads as a fresh empty list to everyone who has not been bitten by it",
    instead: [
      "`def add(item, items=None): items = [] if items is None else items`",
      "a tuple or a frozenset if it never changes: `def name(names: tuple[str, ...] = ())`",
      "on a dataclass, `field(default_factory=list)`, which is called once per instance",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-TRUTH:2",
    category: "TRUTH",
    pass: "fast",
    bans: "`assert` outside a test file, whatever it is checking",
    why:
      "`assert` is not a check. It is a check that disappears when the interpreter is asked to optimise, and `python -O` is how a great many things run in production. A validation written with it passes every test on your machine and is simply absent where it matters, so the first sign of it is the wrong data already saved. That is true of an internal invariant too, which is why this does not try to tell one kind of assert from another",
    instead: [
      "raise, and it survives: `if amount <= 0: raise ValueError(\"amount must be positive\")`",
      "for something arriving from outside, validate it at the edge with a Pydantic model instead",
      "to narrow a type for the checker, narrow it for real: `if proc.stdout is None: raise Broken()`",
      "in a test file this rule is silent — `test_*.py`, `*_test.py`, `conftest.py`, or anything under a `tests` folder — because that is where `assert` is the idiom",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-ERROR:2",
    category: "ERROR",
    pass: "fast",
    bans: "answering a failure with a made-up value — `return None`, `return []`, `return \"\"`, `return 0` inside an `except`",
    why:
      "one line later nothing can tell the made-up value from a real one, so a file that could not be opened becomes an empty string and a database that was down becomes an empty list of orders. The person who sees the screen has no way to know anything went wrong, and the cause is three layers away by the time anyone looks",
    instead: [
      "raise something the caller can act on: `raise Missing(path) from error`",
      "use the error, and this rule steps aside: `except OSError as error: logger.warning(\"...\", error); return None`",
      "return a real answer from a real place: `return fallback.read()`",
      "if absence is a genuine answer, say so in the signature and return it from the `try` as well, so the handler is not the only place it appears",
      "leaving a command with a failing exit code is a report, not a fabrication — say it as one: `raise SystemExit(2)`",
    ],
    valve: { kind: "none" },
  },
];
