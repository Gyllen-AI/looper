# looper

[![tests](https://github.com/gyllen-ai/looper/actions/workflows/test.yml/badge.svg)](https://github.com/gyllen-ai/looper/actions/workflows/test.yml)

An agent writing code for you is fast, agreeable, and unsupervised. looper is
the reviewer who is not in the room: rules that arrive before the work, and
gates that read what was written before it lands.

It is built for the person who has an idea and cannot read the code that comes
back — no engineer to ask, no way to check the answer. Everything it says is
written to be acted on by that person.

```sh
npm install --save-dev github:gyllen-ai/looper
npx looper init
```

That is the whole setup. `init` adds its hooks beside any you already have,
never over them, and running it twice leaves the project byte-identical.

## Before you write anything

An agent reads this file, then starts work. These are the three that change what
gets written, and the order is the point.

1. **Read [STACK.md](STACK.md) — what looper recommends building with.** The web
   framework, the database layer, the front end, one tool per job, for
   TypeScript, Rust and Python alike. It judges nothing and refuses nothing. It
   is there so the first file in a language this project does not already use is
   a choice between named options rather than whatever came to hand.
2. **Read `CURRENTSTACK.md`, which `init` writes into your project.** That one is
   what your project already *is*, measured from disk rather than chosen. It is
   also the gate: `STACK:1` refuses a source file in a language it does not list.
3. **Pull the doctrine for whatever you are about to touch**, with the `doctrine`
   tool. The sets tied to files you have already edited arrive on their own. The
   rest arrive only if you ask — and the first file in a new area is precisely
   the one nothing has arrived for yet.

Skipping the first two is how a project ends up with a second runtime nobody
chose. Skipping the third is how a screen gets built that nobody ever looked at.

## What happens then

**Before each turn**, the rules that matter to what you are touching are put in
front of the agent — not a document it might read, a document it is holding.

**After each edit**, the file is judged. A violation comes back as a repair
instruction: what is not allowed, why it costs you something, and a spelling
that works.

**Before each commit**, everything staged is judged again, plus a scan for
anything shaped like a password or a key — in the files and in the message.

**When a rule set describes code you changed**, and you did not change the rule
set, the commit is refused. A document that quietly describes something that
moved is worse than no document.

## What it reads

**TypeScript and JavaScript**, including React and Next. **Rust**, if the
project has a `Cargo.toml` — looper builds its Rust half with the `cargo` you
already have, and rebuilds it whenever its own source is newer than the binary,
so an upgrade cannot leave you judged by the law it replaced. A TypeScript-only project never sees any of that.

A project with both is not confused by it. looper works out from what is on
disk which half is the backend and which is the interface, and a rule about
database queries never fires on a user interface that has no database.

**Python, seven rules.** A `.py` file is read with Python's own parser — no
extra install, only `python3` on the machine — and judged by `PY-ERROR:1`, the
swallowed error, `PY-ERROR:2`, the made-up answer that hides it, `PY-TRUTH:1`,
the mutable default argument, `PY-TRUTH:2`, `assert` used where `python -O` will
delete it, `PY-TYPE:1`, the silenced type checker, `PY-LAYER:1`, the star import,
and `PY-ERROR:3`, the failure raised without a name.
[STACK.md](STACK.md) prescribes the rest of the Python stack — and every other
stack looper governs, not only this one — and every rule
`docs/PLAN.md` names for Python is now built.

## When a rule is wrong

It will be, and being wrong is the only real failure a tool like this has. Three
ways out, and the rule tells you which one it has:

- **a pardon** — one file, one rule, one line in `law.toml` saying why
- **a knob** — a cap or a list, moved deliberately
- **off** — a whole rule, project-wide, which is the loudest thing you can write

If none of those is the right answer, the rule is wrong everywhere and that is a
bug worth having: `looper report` writes down the shape it fired on and nothing
else of yours, for you to read before it goes anywhere.

The rules are meant to be argued with. See [CONTRIBUTING.md](CONTRIBUTING.md).

## What it is not

Not a linter. A linter is configured per project and switched off when it is
inconvenient, which makes it a preference. This is a law: the concessions are
graded, visible in a diff, and each one is an argument somebody can read a year
later.

## If you want to know why

`docs/PLAN.md` is the design record: every rule argued before it was built, every
decision that was reversed keeping both halves, and every number measured with
the date beside it. Four tests read it and refuse the suite if it drifts from
what the code does.

`docs/FINDINGS.md` is the audit. Seventy-two things that were wrong with this
tool, how each was found, and what closing it cost. All of them are closed, and
the ones still open are named at the top of that file when there are any. A tool
that publishes its own audit — including what it still gets wrong — is making a
claim that is expensive to fake.

## Licence

[Zero-Clause BSD](LICENSE). Use it, change it, ship it, sell it. No attribution
required, no conditions at all.
