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
project has a `Cargo.toml` — looper builds its Rust half once with the `cargo`
you already have. A TypeScript-only project never sees any of that.

A project with both is not confused by it. looper works out from what is on
disk which half is the backend and which is the interface, and a rule about
database queries never fires on a user interface that has no database.

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

`docs/FINDINGS.md` is the audit. Fifty-one things that were wrong with this tool,
how each was found, and what closing it cost. All of them are closed. A tool
that publishes its own audit is making a claim that is expensive to fake.

## Licence

[Zero-Clause BSD](LICENSE). Use it, change it, ship it, sell it. No attribution
required, no conditions at all.

`vendor/rust-law` is somebody else's work under the same licence, with its
origin recorded in [PROVENANCE.md](vendor/rust-law/PROVENANCE.md) — which 0BSD
does not require and which is written down anyway.
