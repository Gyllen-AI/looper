# Contributing

looper is meant to be forked. If a rule is wrong in your codebase, the right
answer is usually to change the rule, not to switch it off — and the way to
change it is here.

Nothing in this file is enforced. An agent working in a project that uses looper
will **suggest** these routes when a rule gets in the way; it will not make you
take them, and it will not open anything on your behalf.

## Using it in your own project

```sh
npm install --save-dev github:gyllen-ai/looper
npx looper init
```

`init` writes hooks that point at wherever looper actually is — a dev
dependency, a global install, or a checkout you are working on. It never
overwrites a hook you already had; it adds looper's beside it, and running it
twice leaves the project byte-identical.

If your project has a `Cargo.toml`, looper builds its Rust half once, with the
`cargo` you already have, and judges `.rs` files from then on. If it does not,
none of that happens and nothing about Rust is installed.

## When a rule is wrong

Three routes, in order of how much they cost everyone else.

**It is wrong here, once.** Pardon the one file in `law.toml` under `[exempt]`,
with the rule id and a comment saying why. One visible line in a diff, arguable
forever.

**It is wrong here, always.** A knob under the rule's valve — every rule that
has one prints it in the report. Widening a knob is a decision about your
codebase; make it small and make it deliberate.

**It is wrong everywhere.** That is a looper bug and we want it. Run:

```sh
looper report
```

It writes a file describing the shape the rule fired on and nothing else of
yours — no identifiers, no paths, no logic, and it refuses to write at all if it
cannot prove that. Read the file. If you are content with it, open an issue and
paste it. If you are not, delete it and nothing has left your machine.

## Changing a rule, or adding one

Fork it. Then, in this order, because the order is the whole discipline:

1. **Write the cases first, from the rule's own ban text**, in
   `audit/cases.ts` — what must fire and what must stay silent. Before you touch
   any code. A test written by reading the implementation can only ever agree
   with the implementation, which is how ten rules here shipped saying less than
   they did.
2. **Then change the code**, until `node --test 'tests/**/*.test.ts'` is green
   and `node audit/evasion.ts` reports zero mismatches.
3. **Then run it over code nobody here wrote.** A rule tested only on its
   author's fixtures agrees with its author. There is a foreign corpus in any
   `node_modules` and any `~/.cargo/registry` — point it at fifty thousand lines
   of somebody else's work and judge every hit by hand.
4. **Write the words in the reader's terms.** The ban says what is not allowed,
   the reason says what it costs a person, and the instead gives a spelling that
   works. Someone who cannot read code has to be able to act on it.

Then open a pull request that says what you found in step 3. A rule with
evidence behind it will be taken; a rule that only sounds right will not.

## Changing looper itself

Same three steps, and one more: looper is governed by its own law. Your change
has to pass the gates it installs in everybody else's project. If that is
painful, that is the product telling you something, and the finding is worth
more than the workaround.
