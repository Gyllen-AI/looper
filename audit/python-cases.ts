export type PythonCase = {
  readonly rule: string;
  readonly name: string;
  readonly code: string;
  readonly expect: "fires" | "silent";
};

export const PYTHON_CASES: readonly PythonCase[] = [
  { rule: "PY-ERROR:1", name: "a bare except swallowing everything", expect: "fires",
    code: `def f(p):\n    try:\n        return open(p).read()\n    except:\n        return ""\n` },
  { rule: "PY-ERROR:1", name: "an except whose body is pass", expect: "fires",
    code: `def f(p):\n    try:\n        open(p)\n    except OSError:\n        pass\n` },
  { rule: "PY-ERROR:1", name: "an except that does nothing by ellipsis", expect: "fires",
    code: `def f(p):\n    try:\n        open(p)\n    except OSError:\n        ...\n` },
  { rule: "PY-ERROR:1", name: "catching everything and doing nothing", expect: "fires",
    code: `def f(p):\n    try:\n        open(p)\n    except Exception:\n        pass\n` },
  { rule: "PY-ERROR:1", name: "a bare except is still bare when its body works", expect: "fires",
    code: `import logging\n\n\ndef f(p):\n    try:\n        open(p)\n    except:\n        logging.warning("could not open")\n` },
  { rule: "PY-ERROR:1", name: "logged and recovered from in the open", expect: "silent",
    code: `import logging\n\n\ndef f(p):\n    try:\n        open(p)\n    except OSError:\n        logging.warning("could not open %s", p)\n` },
  { rule: "PY-ERROR:1", name: "re-raised", expect: "silent",
    code: `def f(p):\n    try:\n        open(p)\n    except OSError:\n        raise\n` },
  { rule: "PY-ERROR:1", name: "re-raised as something named, keeping the cause", expect: "silent",
    code: `class Missing(Exception):\n    pass\n\n\ndef f(p):\n    try:\n        open(p)\n    except OSError as error:\n        raise Missing(p) from error\n` },
  { rule: "PY-ERROR:1", name: "suppress names what is ignored, which pass never does", expect: "silent",
    code: `from contextlib import suppress\n\n\ndef f(p):\n    with suppress(FileNotFoundError):\n        open(p)\n` },
  { rule: "PY-ERROR:1", name: "a class body of pass is not an except", expect: "silent",
    code: `class Missing(Exception):\n    pass\n` },
  { rule: "PY-ERROR:1", name: "a function body of pass is not an except", expect: "silent",
    code: `def later():\n    pass\n` },
  { rule: "PY-ERROR:1", name: "a try with no except at all", expect: "silent",
    code: `def f(p):\n    try:\n        open(p)\n    finally:\n        print("done")\n` },
];
