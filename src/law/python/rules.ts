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
];
