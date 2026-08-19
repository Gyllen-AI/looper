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
  {
    id: "PY-TYPE:1",
    category: "TYPE",
    pass: "fast",
    bans: "`# type: ignore` on a line, and `# mypy: ignore-errors` on a file",
    why:
      "Python's annotations only mean something because a checker reads them, so silencing the checker is not a small local exception — it is the annotation on that line quietly ceasing to be true while still reading as though it were. The comment stays after the code around it changes, and the next person believes the annotation, because that is the part written in words they understand. `# mypy: ignore-errors` does it to a whole file at once",
    instead: [
      "make the annotation true: `def total(rows: list[int]) -> int:`",
      "narrow it where the value arrives, and the checker stops complaining on its own: `if row is None: raise Missing()`",
      "for something from outside, validate it into a Pydantic model and the type is earned rather than claimed",
      "if the checker is genuinely wrong about a library, say so where that is true — a stub, or `[[tool.mypy.overrides]]` naming the module — rather than on your own line",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-SECURITY:1",
    category: "SECURITY",
    pass: "fast",
    bans:
      "handing the operating system a command built by pasting values into it — `os.system`, `os.popen`, `subprocess.getoutput` and `getstatusoutput`, and `subprocess` called with `shell=True`",
    why:
      "the text goes to a shell, and a shell reads punctuation as instructions. A value holding a semicolon stops being a filename and becomes a second command, running with everything your program may do. It does not take an attacker: a file somebody named `report;rm -rf ~.csv` is enough. Python makes this the path of least resistance, because `shell=True` is one keyword away and the argument-list form needs the command split up",
    instead: [
      "`subprocess.run([\"convert\", source, target], check=True)` — the arguments stay arguments and are never read as instructions",
      "a pipeline is two `Popen` calls joined by `stdout`, not one string with a `|` in it",
      "if a shell feature is genuinely needed, build the line only from words you wrote, never from one that arrived",
      "`shlex.quote` is a repair for a design that already went wrong; an argument list needs no quoting at all",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-SECURITY:2",
    category: "SECURITY",
    pass: "fast",
    bans:
      "building a database query by pasting values into the text of it — an f-string, a `+`, a `%` or `.format(...)` handed to `execute`, `executemany`, `executescript` or `text`",
    why:
      "whatever the value contains becomes part of the instruction. Somebody typing the right thing into a search box can read your whole database, or empty it. This is the single most exploited mistake in software and has been for twenty-five years. Every Python database driver already does this safely, and the safe spelling is shorter than the unsafe one",
    instead: [
      "`cursor.execute(\"SELECT * FROM orders WHERE id = ?\", (wanted,))` — the driver keeps the value out of the instruction",
      "with psycopg the placeholder is `%s` and the values are a tuple, which is not the same as `%` formatting: `cursor.execute(\"... id = %s\", (wanted,))`",
      "a table or column name cannot be a parameter, so choose it from a list you wrote rather than pasting one that arrived",
      "with SQLAlchemy: `session.execute(text(\"... id = :id\"), {\"id\": wanted})`",    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-LOG:1",
    category: "LOG",
    pass: "fast",
    bans:
      "`print`, and writing to `sys.stdout` or `sys.stderr` directly, in a file that does not say it starts the program. A `print` whose destination the caller supplied — `print(line, file=out)` — is not this rule, because the caller chose where it went; `file=sys.stdout` and `file=sys.stderr` are, because the module chose",
    why:
      "what a program prints is its output, and it belongs to whoever ran it. A module that prints has made that decision for every caller it will ever have, including the one piping the output into something else, the one running it as a library inside a web service, and the one who wanted the failure raised rather than described. It is also the most common way a value nobody meant to publish reaches a log file, because printing is how you look at something while you are working and nothing removes it afterwards",
    instead: [
      "`logger = logging.getLogger(__name__)` at the top, then `logger.info(\"saving %s\", order)` — the caller decides where it goes and whether it goes anywhere",
      "hand the words back and let the caller print them: `return f\"saved {order}\"`",
      "a failure is raised, not described: `raise CouldNotSave(order) from error`",
      "printing belongs where the program starts, and this rule steps aside in any file that says so — under `if __name__ == \"__main__\":`, or in a `__main__.py`",
      "take the destination as an argument and the choice returns to the caller: `def dump(rows, file): print(rows, file=file)`",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-LOG:3",
    category: "LOG",
    pass: "fast",
    bans:
      "a value baked into a log message instead of carried beside it — an f-string, a `%`, a `.format()` or a concatenation handed to a logger, in a file that imports `logging` or `structlog`. `logger.info(\"saved %s\", order)` is not this rule: the standard library defers that formatting and the value stays a separate argument",
    why:
      "a message with the value inside it is a sentence, and every line is a different sentence. The only way to find them later is to guess the wording, and the value cannot be filtered, counted or grouped by anything. Formatting eagerly also does the work even when the level is off, which is the second cost and the smaller one",
    instead: [
      "`logger.info(\"saved\", extra={\"order\": order})` — the message is a constant and the value is a field",
      "`logger.info(\"saved %s\", order)` — the standard library's own lazy form, formatted only if something is listening",
      "a value nobody will ever query does not need to be in the line at all",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-LAYER:1",
    category: "LAYER",
    pass: "fast",
    bans: "`from x import *`, which takes every name a module has without saying which",
    why:
      "afterwards nobody can tell where a name came from — not a reader, not an editor, not a checker. Two star imports in one file and the second silently replaces names from the first, so a function you thought you were calling is a different one with the same name, and nothing anywhere says so. Adding a name to the module you imported from can break this file without touching it",
    instead: [
      "name what you take, and the line says where it came from: `from os.path import join`",
      "keep the module and read through it: `import os.path` then `os.path.join(...)`",
      "re-exporting from a package is worth writing out: `from .models import Order as Order`, or list them in `__all__`",
    ],
    valve: { kind: "none" },
  },
  {
    id: "PY-ERROR:3",
    category: "ERROR",
    pass: "fast",
    bans: "`raise Exception(...)` and `raise BaseException(...)`, which name no failure at all",
    why:
      "the only way to catch this on purpose is `except Exception`, which catches every other failure in the program at the same time — including the ones you meant to let through. So the caller cannot retry the one that is worth retrying, or report the one the person can fix, and the message in the brackets is readable by a human and by nothing else. A name is what lets code downstream tell one failure from another",
    instead: [
      "a class of your own, one per failure: `class AmountNotPositive(Exception): pass` then `raise AmountNotPositive(amount)`",
      "a built-in that already names this kind: `raise ValueError(\"amount must be positive\")`, `raise KeyError(name)`",
      "keeping the cause when you rename it: `raise CouldNotRead(path) from error`",
      "`Exception` as a base class is how a named one is made, and this rule says nothing about that",
    ],
    valve: { kind: "none" },
  },
];
