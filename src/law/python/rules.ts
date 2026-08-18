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
];
