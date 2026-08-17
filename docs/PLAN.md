# looper — plan

Binary `looper`. This document is the whole design and the only planning
artifact in the repo. It is written before the code and corrected in place as
the code corrects it.

## What it is

One tool you point at any project to install a governed agent workflow: the
project's rules re-asserted every turn, a coding standard enforced at edit time
and at commit time, a credential gate, and a durable memory.

It prescribes one stack and governs it completely — TypeScript across web,
mobile, API and database — rather than accommodating every language a company
has ever shipped. Repos on other languages still get doctrine, the credential
gate and memory, because those need no parser. They do not get the law. That
asymmetry is the incentive.

Two things it must do, and they pull in opposite directions:

1. **A perfect init on a fresh project.** One command and the project is
   governed from its first commit, with real rules already in force before
   anyone has written a line of doctrine.
2. **A safe plugin on an existing project.** Point it at a repo with its own
   hooks, its own linter and its own settings, and it adds what is missing,
   changes nothing it does not own, and gets better as the user keeps prompting.

Property 2 is the one that is hard, and it is the one that decides whether this
gets used. A tool that can brick a working repo gets run once.

## The pillars: what strictness actually means

Strictness is the product, not a side effect of it. A permissive tool that
occasionally mentions a problem changes nothing, because the consumer is an
optimizer and an optional rule is a rule that is off. What follows is what
looper is strict *about*, and every one of these is a gate somewhere or it is
not real.

The reason is longevity. Each pillar below is a defence against the specific way
a codebase becomes unmaintainable, and each one costs something today to save
much more later. That trade is the whole bet.

1. **No dead code.** No unreferenced export, no unreachable branch, no
   commented-out block kept "just in case", no stub that returns nothing.
   Dead code is a lie about what the system does, and every future reader pays
   to discover it was a lie. Enforced by the `DEAD` category and by
   `noUnusedLocals` / `noUnusedParameters` in the shared tsconfig.
2. **One source of truth.** A fact is declared once. Not a constant duplicated
   in two modules, not a type hand-written beside the schema that already
   describes it, not two config files that must agree. Divergence is inevitable
   and it is silent. Enforced by the `TRUTH` category, and structurally by the
   stack: one Zod schema yields the database types, the API validation and the
   OpenAPI contract, so there is nothing to keep in sync.
3. **No fallbacks, ever.** No `?? "default"` covering a value that should have
   been there, no silent retry hiding a dependency that is down, no `catch` that
   returns a plausible stub. A fallback converts a loud failure into a wrong
   answer that surfaces three layers away from its cause, and that is strictly
   worse than a crash. Absence may resolve to a default in exactly one declared
   file and nowhere else.
4. **Verify everything.** Every boundary validates: no trusting request bodies,
   no trusting a cast, no trusting that a row exists. Enforced by the `TYPE`
   category — no `as any`, no `as unknown as`, no `!`, no `@ts-ignore` — and by
   the `DATA` pack requiring a schema in front of every input.
5. **Never fail silently.** Every failure is observed or propagated, never
   swallowed. This is the pillar the language fights hardest, which is why the
   law exists at all.
6. **Say it every turn.** The model is told what is allowed and what is not on
   every single prompt, not once in a file it skimmed at session start. This is
   the one pillar that is architecture rather than a rule: it is the injection
   allocator, and it is why per-turn cost is budgeted and printed rather than
   left to grow.

**Strict is not unappealable — where there is somebody to hear the appeal.**
Every pillar has a concession path, and the concession is one visible line in
`law.toml` or a pardon on one named file. The point was never that the rule can
never be bent — it is that bending it costs a diff, a reviewer and a reason. A
rule with no concession path gets disabled wholesale the first time it is wrong,
which is how strict systems die.

That whole argument rests on a reviewer, so it holds only where one exists. On a
project whose owner cannot read the code, the appeal is closed — see
"Self-sufficient, because there is nobody to fall back on". The rules do not get
softer there; the bar on their precision gets higher, because a rule that misfires
with no escape hatch does not get switched off, it strands someone.

**Two failure domains, do not confuse them.** "No fallbacks" governs the code
looper watches: code that cannot get a value must not invent one. "Fail open"
governs looper itself: a governance accessory that cannot reach a verdict must
not wedge the session. Same word, opposite obligation, because one of them is
the product and the other is the inspector.

## Isolation, stated first because it constrains everything else

looper is built from scratch. It is not a port, a fork, a wrapper or a vendored
copy of anything. No code, no rule files, no fixtures, no generated artifacts and
no build outputs enter this tree from any other project.

There is an earlier tool of the same lineage: a governed-agent loop the author
built and ran for months, in a different language, living inside one private
project. looper carries over what he learned from it and none of what he wrote.
That is not an ownership question — both are his. It is a design one, and the
reason is the whole point of this tool:

**that earlier tool was built for one project, in one language, on one machine,
and it is shot through with all three.** Its doctrine names that project's
domain. Its rules encode that language's failure modes. Its hooks assume that
author's setup. Copying it would import every one of those assumptions into a
tool whose first requirement is that anyone can point it at anything. The parts
worth having are exactly the parts that survive being separated out, and
separating them is cheaper by rewriting than by deletion.

So the earlier tool is a source of evidence, never a source of code. It is read
to answer questions and to learn what rotted. It is not opened to copy from.
Where prior experience motivates a decision, this document argues that decision
on its own merits, because a reason that works only as an appeal to unnamed
prior art is not a reason anyone else can check.

### The other direction, which now matters more

looper is written to be adopted by organisations, and their internal
architecture, their vendors, their team structure and their product are
**theirs**. None of it belongs in a generic tool's planning document. Where this
plan needs to speak about an adopting organisation it does so in the abstract,
and the particulars of any one adopter live outside this repo.

This is the same discipline the canon is held to, applied one level up:
**nothing belonging to one adopter is written into the thing every adopter
receives.** A plan that failed this test would produce a canon that failed it
too, and the canon is the part that ships.

## Principles this design commits to

Each is built here from scratch. They are listed because they are load bearing,
and because dropping one later should cost an argument.

| principle | why it is load bearing |
|---|---|
| **when two readings exist, take the stricter one** | the tie-break for every decision in this document — see below |
| container + capability plugins | the seam is the asset; every later capability is additive or it is a rewrite |
| the canon compiled into the binary | generic law that cannot drift into N copies, and nothing written into a repo we do not own |
| doctrine as a tree, budgeted per prompt | a flat rules file cannot hold a real project and cannot be afforded every turn |
| the repair-prompt contract | a violation message must be sufficient on its own to fix from |
| graded concessions in one file | valve, pardon, disabled: same ledger, different blast radius |
| the no-network invariant, checked at the socket layer | a tool that runs on every edit and every commit must not be able to phone home |
| hooks are our own binary | no scripts on disk, no interpreter, one dispatch process per event |

**The tie-break, because it decides more than any single rule.** Where a decision
has a stricter reading and a looser one and both are defensible, **take the
stricter, robust one.** Not as a temperament — as the rule that resolves the
argument, so the argument does not have to be had again at every rule.

Two things make it work rather than merely make it severe:

- **Strict usually turns out to be the more decidable reading, and where it does,
  that settles it.** `TS-TRUTH:1` is the worked example: the lenient version
  needed a judgment — is this `??` inventing a value or discharging an absence? —
  and judgment is where a rule misfires. Banning the construct outright left
  nothing to judge. The looser reading was the fragile one.
- **Where strict is genuinely less robust, that is a signal about the rule, not a
  licence to soften it.** A stricter reading that cannot be decided without
  guessing, or that has no legal spelling to hand back, is not a strict rule — it
  is a broken one, and the answer is to fix or drop it, never to ship a lenient
  version that fires vaguely.

What this rules out is the specific failure that produced two wrong calls in this
document already: reaching for the looser reading on **budget or taste** — "real
but infrequent", "this is the ecosystem convention", "a beginner would find this
harsh". None of those is an argument. There is no rule budget, convention is not
evidence, and severity is paid by the agent.

## Deliberately out of scope

- **A code navigator.** No AST index, no call graph, no `find`/`callers`/
  `usages`. It is the substrate for capabilities we are not building, and the
  languages here already have editor tooling that answers location.
- **`reuse`.** It is a query against that index. Without the index it has no
  substrate, so it is deferred rather than built badly.
- **Vision.** Screen capture with a consent gate is a good product and a
  different one. Out of scope, no removal condition needed.
- **A WSL to Windows bridge.** Only vision would have needed one.

## Who it is for, and how deep it goes

looper is handed to whole teams — marketing, data, engineering — and each points
it at their own project. That is a distribution requirement, and it rules some
things out. It cannot assume the installer is a TypeScript engineer, cannot
require configuration before it is useful, and cannot ever damage a repo it does
not understand.

It resolves into **two depths, and the depth is detected, never declared**:

**Depth 1 — any project, any language, any team.** The doctrine tree, the
credential gate, durable memory, the freshness gate, and the one law rule that
needs no parser: the file-size cap. None of this reads code as code, so it works
on a marketing team's repo of SQL, spreadsheets, scripts and documents exactly
as well as on a service. A team at this depth gets rules re-asserted every turn,
secrets caught before they are committed, and memory that survives the session.
That is already most of the value and it costs them one command.

**Depth 2 — the prescribed stack.** Everything above, plus the full law. This is
where the `TYPE`, `ERROR`, `DEAD`, `LAYER`, `REACT`, `NEXT`, `NODE` and `DATA`
packs live.

The rule that makes this work is already in the capability model and is restated
here as a promise: **what does not apply is silent, never an error.** A repo with
no `.ts` files hears nothing from the TypeScript law. A repo with no React hears
nothing from the React pack. There is no configuration step where someone
declares what they are — the file extensions and the imports already said it.

Four consequences worth writing down before they are discovered:

- **Zero-config must be genuinely useful,** because a marketing team will never
  write a doctrine branch. The canon has to carry real value on its own, which
  raises the bar on chunk 1 rather than lowering it.
- **Every message must read to a non-specialist.** The repair prompt already has
  to be sufficient to fix from; now it also has to be sufficient for someone who
  does not know the language's jargon. That is a constraint on the wording of
  every violation, not a nicety.
- **Depth 1 must never mention depth 2.** Telling a team about rules that will
  never apply to them is noise, and noise is how a governance tool gets
  uninstalled.
- **Nothing load-bearing sits behind a command someone has to know to type.**
  This is the one most easily got wrong, because writing `looper law` into a plan
  feels like shipping the feature. It is not. The user this is built for does not
  know the command exists, and — the harder half — could not tell when running it
  would have helped and when it would not. A check that fires only when someone
  who cannot judge decides to run it is a check that does not fire. So **every
  gate triggers on its own**, and **every fact that must be seen is pushed to
  where the reader already is** rather than waiting in a command's output.
  Commands still exist, for the author and for debugging; they are never the only
  path to anything that matters.

### Self-sufficient, because there is nobody to fall back on

The user this is built for has the idea and none of the craft. Not an engineer
who is busy — no engineer, at any point, ever. Every place the design quietly
assumes one is a place the tool stops working, and the assumption is easy to make
because it looks like ordinary good manners: leave that decision to the user.
There is no user qualified to take it.

So the standing rule is **the system finishes what it starts.** If a step is
needed for looper to work, looper does it. Printing an instruction and calling
that shipping the feature is the same mistake as putting a check behind a command.

**It may ask, and the questions are the product's manners.** Three constraints,
and they are constraints on the wording, not sentiment:

- **Ask about the outcome, never the implementation.** They can answer "should
  people be able to sign in?" They cannot answer "session cookie or bearer
  token?", and asking is worse than useless — it transfers a decision to the one
  person who cannot make it, and they will answer anyway, from the shape of the
  question rather than knowledge. The canon already forbids asking which of two
  sound options to take; here the ban is wider, because at this depth almost every
  technical fork is one the model must simply decide.
- **What earns a question changes with the depth.** For an engineer the short list
  is schema, wire contracts, security boundaries. For this user it is: what the
  thing should *do*, anything that costs money, and anything that cannot be
  undone. Those three and nothing else.
- **No jargon, no acronym, no file path in the question.** Concrete, two or three
  options, each with what it means for them in a sentence.

**The concession path closes at depth 1, and that is deliberate.** A valve is one
visible line in a diff, argued once, reviewable forever — but that model assumes a
reviewer, and here there is none. An agent that could talk this user into waving a
rule through has an elaborate way of talking to itself, and the rule it waves is
the one protecting them from a decision they cannot judge. So the agent finds the
compliant path or it keeps working; it does not offer the user an exit. Valves,
pardons and disabled rules stay what they are — an expert's instrument, on an
expert's project.

That costs something and the cost is named here rather than discovered:
**precision matters more at this depth than anywhere else,** because there is no
escape hatch at all. The failure mode is not the one the plan warns about above —
this user will not disable a rule that keeps misfiring, because they would not
know how. They will simply be stuck, watching an agent fail in a loop, with no way
to tell whether the tool or their idea is at fault. A rule that is wrong here does
not get switched off; it wastes their afternoon and their trust.

Which sets the last obligation: **a violation the agent cannot discharge is our
bug, not their problem.** If the law blocks and no legal spelling exists, that is
a defect in the rule set, and it is recorded as one — never handed to the user as
a technical decision to resolve.

## The stack looper governs

For depth 2, looper prescribes a stack rather than accommodating whatever it
finds. That is the move the law and the doctrine already make, one level up: an
opinion, argued once, enforced everywhere. The alternative — supporting every
language a company has ever shipped — buys breadth by making every language reader
shallow, and a shallow law is one an optimizer walks around.

To be explicit, because the two sections could be read as contradicting each
other: **the stack is a prescription for building new services, not a
precondition for using looper.** A team on none of it still gets depth 1, in
full, with no complaint from any capability about what they are missing.

**One language: TypeScript, everywhere.** Web, mobile, API, scripts. Not because
TypeScript wins every slot on its own merits, but because the coherence is worth
more than any single slot's optimum:

- One grammar means **one parser and one language reader, at full depth, over all new
  code**. The broad-but-thin tier stops being a requirement.
- One type system spans the whole request path, so a renamed database column is
  a compile error in a React component. That is fewer bugs bought structurally
  rather than by discipline.
- One set of idioms to write doctrine about. The canon has one language to be
  right about.

A stack still needs one tool per job. That is not the same as one language per
job, and the distinction is the entire point. **The list of tools lives in
STACK.md and only there** — this section argues the choices, that file states
them, and a test refuses any attempt to keep a second copy here.

Compiler settings are part of the stack, not a preference: `strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. The last two are the
ones teams forget and they are the ones that catch real bugs.

Two entries are load bearing for the law rather than for the product. **Pino**
gives the "a failure must be observed" rule a named symbol whose provenance can
be verified — `logger.warn`, `logger.error` — which is what stops a local
do-nothing function called `warn` from satisfying it. **Drizzle** puts the
database schema in TypeScript, so the parser we already have can read it; a
schema in its own language would cost a second grammar.

### The picks that were close, recorded so they are not relitigated

- **Drizzle, not Prisma.** Prisma has the better first day. But its schema is a
  separate language, which would put a second grammar into a stack whose whole
  premise is one grammar, and it generates a client that must be kept in sync.
- **Hono, not Nest or Fastify.** Nest fails "easy to navigate": decorators and
  dependency-injection metadata mean the call graph is not in the code. Fastify
  is the conservative swap and is not a wrong answer.
- **The API is standalone, not Next.js route handlers.** React Native needs the
  same API the web does, and an API living inside the web app is one the phone
  cannot reach without deploying the website.
- **OpenAPI, not tRPC.** tRPC is nicer when every caller is TypeScript. Callers
  outside it — existing services in other languages, partners, third-party
  integrations — are served by a generated spec and stranded by tRPC.

### What this means for the languages already here

Every organisation that adopts this has services in languages the prescribed
stack does not cover, and they do not disappear. They are **governed shallowly**:
`router`, `secrets`, `recall` and the freshness gate are language-agnostic and
need no parser at all, so those repos still get doctrine, a credential gate and
memory. What they do not get is the law.

New work goes on the prescribed stack and gets the full law. That asymmetry is
the incentive and it is deliberate.

**looper does not scaffold this stack.** Prescribing what a project is built
from is not the same as generating it, and a starter-app generator is a
different product. Out of scope, no removal condition needed.

## The capability model

One trait, registered once, and its MCP tools plus its per-prompt injection plus
its hook reactions all wire themselves:

```ts
interface Capability {
  readonly name: string;
  tools(): ToolDef[];
  call(tool: string, args: unknown): Promise<ToolResult>;
  hooks(): HookEvent[];
  onHook(event: HookEvent, payload: unknown): Promise<Outcome>;
  inject(ctx: InjectCtx): Contribution;
  scaffold(): FileChange[];
}
```

`inject` is synchronous on purpose: it runs on the prompt path, it may only
read state the registry already holds, and a capability that wants to do I/O
there is a capability that will one day hang a turn.

A capability that does not apply to a project is **silent, never an error**. A
Python rule set has nothing to say about a repo with no `.py` files, and saying
so on every prompt is worse than saying nothing.

v0.1 capabilities: `router` (the doctrine tree), `law` (the standard),
`secrets`, `recall`.

**Implementation language: TypeScript on Node.** It is the stack the people who
will maintain this already read, and a governance tool nobody on the team can
edit is a governance tool that gets deleted. Node ≥ 22, shipped as an npm
package with a bundled single-file entry point.

That choice was measured, not assumed, because the honest objection is speed:
the hook runs on every matched tool use, so process start is a tax paid per
edit. Measured on this machine, 2026-08-17, Node v22.23.2:

| | module load | parse (1,562-line TSX) | walk (12k nodes) | cold process |
|---|---|---|---|---|
| `typescript@5.9.3` | 105 ms | 36 ms | 1.2 ms | 164 ms |
| `@babel/parser@7` | 8.8 ms | 38 ms | 2.4 ms | **67 ms** |

Three results, and they set the architecture. **Module load dominates, not
parsing** — so the parser is required lazily and only an event that actually
judges code pays for it. **Walking is free** — 12,254 nodes in 2.4 ms means rule
count is not a cost, and a language reader can run its whole set in one pass. And a
bare `node -e '0'` is 18 ms, which is the floor under everything.

So the budget is **~70 ms on an edit that parses and ~20 ms on one that does
not**, against agent turns measured in seconds.

**Measured again 2026-08-17, with 23 rules built, and it caught a real mistake.**
The whole fast set on one file took 63.8 ms, of which 64.6 ms was parsing: every
rule was parsing the same file again, so the cost grew linearly with the rule
count and would have passed the budget at around thirty rules. The prediction
above — walking is free, rule count is not a cost — was right, and the engine was
not built to it. Parsing is now remembered per file, and the same measurement is
30.3 ms cold and 11.1 ms warm, flat in the number of rules. A test holds it by
comparing the whole set against a single parse rather than against a wall-clock
number, so it stays honest on a slower machine. The old ~15 ms figure was a
number from a compiled language and it is retired rather than missed. Throughput
at pre-commit is the budget that actually bites, and there the process is warm
and the cost is ~38 ms per file.

## The doctrine tree

Four tiers, each matched to how big the content is and how enforceable it is.

| tier | where | how it reaches the model |
|---|---|---|
| 0 | canon constitution (in the binary) + `.looper/doctrine/constitution.md` | injected every prompt, canon half first |
| 1 | canon branch + project branch of the same name, merged | auto-loaded when the session's files land in the branch's area (`map.toml`), or pulled by name with the `doctrine` tool |
| 2 | the project's own long-form docs | read on demand, never injected |
| 3 | `law`, `secrets`, the freshness gate | runs, and is not asked to be remembered |

Two selection mechanisms, both needed. **Signal-directed:** the hook sees which
files the session touches and loads that area's branch unasked. **Model-directed:**
the constitution carries a branch index and an instruction to name every branch
the task touches and pull each, because only the model knows what it is about to
do. The index and the instruction are content, not comments: a router that
strips `#` lines silently kills the model-directed half and every cross-cutting
branch with it.

Injection is **allocated, not taken**: a hard char ceiling, contributors ordered
by priority, overflow dropped with a visible marker, and `looper status` prints
what is injected and what it costs per turn. Invisible per-turn overhead is how
this kind of tool becomes unusable with nobody able to point at the cause.

**The measured numbers, 2026-08-17,** because the budget is a measurement and not
a preference. Always-on tier 3,530 chars; every branch matching at once 9,621;
budget 9,800; hook ceiling 10,000. It runs close because a rule anchored to a
dated failure costs roughly three times what the same rule costs as a principle,
and that anchoring is what stops it being skimmed — so the cost is bought
deliberately. The number that has to come down is the **always-on tier**, not the
total, and the thing that brings it down is the model-directed `doctrine` tool:
the lines with no file to signal them (the isolation rule, the tie-break) are
always-on today only because nothing else can reach them. A test gates the widest
case, so this cannot drift silently.

**The tree must not rot.** `map.toml` ties each branch to the code it governs.
Change code under a governed area without updating that branch and the commit is
refused unless the message carries an explicit `Doctrine-freshness: <why not>`
line. That bypass is itself a counted, surfaced artifact, because a mechanical
gate cannot tell a human's considered "no change needed" from an agent pasting
the same line on every commit. The agent writes both the code and the message.

## The law: one engine, several language readers

This is the part that needs the most care and it is why the plan is chunked.

### What the law is for here, which is not what it was for in a compiled language

Worth stating plainly, because it changes the bar for what counts as a rule.

In a language with checked errors, the compiler already makes failure loud. A
fallible call cannot be ignored by accident — throwing the result away takes a
deliberate keystroke. A law in that world is largely **reactive**: the rigor
already exists and the rules catch people escaping it.

TypeScript is the opposite. Silent failure is the default, and it compiles clean:

```ts
try { await save(user); } catch {}   // the failure vanishes
save(user);                          // never awaited; the failure vanishes
```

Neither line produces a warning from anything. So the law here is not policing
escapes from rigor — **it is supplying rigor the language does not have.** That
is the project in one sentence, and it is why the law is the capability that
justifies the rest.

### Two classes of rule, because "evidence" means two things

Property 5 below says rules grow only on evidence, and it stays. But conflating
the two kinds of evidence would either block the founding rules or license
speculation, so they are named:

- **Constitutive.** The language permits a failure mode by default. The evidence
  is the language's own semantics, demonstrable in a three-line fixture that
  compiles clean and loses an error. These ship from day one, and they are the
  reason the tool exists. An empty `catch` is not a speculative rule.
- **Reactive.** Everything else, added only when a real bypass is caught in real
  work — never because it seemed likely.

A proposed rule that files under neither was invented rather than found, and
that is exactly the signal to reject it.

### The five properties every rule has to hold

A syntax-level rule engine is easy to build badly. These five are what separate
one an agent obeys from one it routes around, and no rule ships without all
five:

1. **Syntax only.** No type inference, no compilation. That is what lets it run
   on a single unsaved file in milliseconds, and it is also what stops it
   disagreeing with itself between versions.
2. **The violation message is the repair prompt.** What is banned, why the rule
   exists, the legal spellings written out as working code, and the valve if the
   rule has one. Enough that the fix needs no other document. A terse
   `E103: disallowed construct` costs a round trip every time it fires.
3. **Non-gameable.** The consumer is an optimizer. A rule that requires failures
   be logged is satisfied by declaring a local do-nothing function called `warn`,
   so the engine verifies the symbol's provenance: real dependency, not shadowed.
   Parameterize the vendor, never the requirement.
4. **The knobs are a single visible file.** `law.toml` at the root, every key
   written at its default, so deleting a key changes nothing and deleting the
   file changes nothing. A concession is one line in a diff, argued once,
   reviewable forever.
5. **Rules grow only on evidence.** A rule is added when a real bypass is
   caught, never speculatively. Rule sets rot by accretion, each addition
   defensible alone, the whole becoming a maze the agent navigates instead of a
   principle it follows.

### How the rule set is derived

Rules are written per language, from how that language actually goes wrong.
Nothing is transcribed from anywhere. The categories are shared, and for each
one the question is what the failure's spelling is in the target language:

- **Silent error handling.** TypeScript: `catch {}`, `.catch(() => {})`, a
  caught error neither logged nor rethrown. Python: a bare `except:`,
  `except Exception: pass`.
- **Erased error types.** TypeScript: `catch (e: any)`, and
  `throw new Error(string)` where a typed error exists.
- **Defeated type checking.** TypeScript: `as any`, `as unknown as T`,
  `@ts-ignore`, `any` in a written position, non-null assertion `!`. Python:
  `# type: ignore`.
- **Namespace laundering.** `export *`, `from x import *`.
- **Language-native rot.** Python: a mutable default argument, a bare `assert`
  used as a runtime check, a mutable module-level global. TypeScript: a floating
  promise in statement position, `==` where `===` is meant.

Where a category has nothing to say in a language, that is recorded as a
deliberate absence, so nobody later fills the gap with a bad approximation.

The categories are language-neutral: `DECOMPOSITION`, `LAYER`, `ERROR`, `TYPE`,
`DEAD`, `TRUTH`, `LOG`, `TESTS`, plus `REACT` where hook and component rules
genuinely have no home in the eight. Rule ids are namespaced by language reader so
`law.toml` reads unambiguously: `TS-ERROR:1`, `PY-ERROR:1`, `REACT:1`.

### The TypeScript rule table

The derivation above, carried out. The question asked of each failure mode is
not "is this rule good" but **"does this failure exist in TypeScript, and what
is its spelling here"** — so a rule survives when the failure survives, changes
when only the spelling changes, and is dropped when the language cannot express
the failure at all. A dropped rule is recorded as a deliberate absence so nobody
later fills the gap with a bad approximation.

The axis this table is judged on is **precision, not severity.** Severity is
free: the agent pays it, in the same turn, from a repair prompt that contains
the fix, and the human never sees it. Imprecision is expensive: a rule that is
wrong a hundred times burns the turn and teaches the consumer that the law is
noise to route around, which is the only way this actually dies. So every rule
below must be decidable from syntax without false positives, and must hand back
a legal spelling the agent can discharge — and the set as a whole must be
collectively satisfiable, because a legal spelling that violates another rule
leaves the agent with nowhere to go.

**`DECOMPOSITION` — every file has one job.**

| id | bans | origin |
|---|---|---|
| `TS-DECOMPOSITION:1` | file over the line cap | carries unchanged; the one law rule that needs no parser, so it is also the depth-1 rule |
| `TS-DECOMPOSITION:2` | an `index.ts` barrel holding anything but `export … from` | rewritten. Logic parked in the map is logic nobody goes looking for, and a barrel with a body is also how the circular-import class that Rust does not have gets built — **not built yet** |
| `TS-DECOMPOSITION:3` | function over the fn line cap | carries unchanged; declarations, arrows and methods alike — **not built yet** |

**`LAYER` — the import graph is law.**

| id | bans | origin |
|---|---|---|
| `TS-LAYER:1` | an import crossing the declared layer map | carries unchanged, and is cheaper here than in a language with inline paths: imports are explicit, and the layer is the first segment under `src/` — **not built yet** |
| `TS-LAYER:2` | `require()` and dynamic `import()` at a call site | rewritten. TypeScript has no inline qualified path, but the failure is the same one — a dependency that no header shows and no layer check can see |
| `TS-LAYER:3` | assignment or mutation into a module-level container of callables | rewritten, and sharper than its ancestor. A `const` map of imported handlers is visible in the graph and passes; what inverts the graph is *registration at runtime*, so the rule targets the write, not the declaration — **not built yet** |

**`ERROR` — propagate or crash; if you recover, the log knows.**

| id | bans | origin |
|---|---|---|
| `TS-ERROR:1` | a floating promise — a fallible call in statement position, never awaited | rewritten, and **not decidable from one file** — it runs on the slow pass, see below |
| `TS-ERROR:2` | a discarded payload: `catch {}` binding nothing, `catch (e)` where `e` is never read, `.catch(() => …)` taking no parameter | rewritten — **not built yet** |
| `TS-ERROR:3` | a catch arm fabricating a value: `catch { return null }`, `return []`, `return {}`, `.catch(() => [])` | carries in full, and it is **the highest-value rule in the set for TypeScript** — the dominant failure in agent-written code, and precisely syntax-decidable |
| `TS-ERROR:4` | a caught error neither rethrown, propagated, nor observed | carries in full, with the provenance check on the blessed symbol: `logger.warn` / `logger.error` resolved through a real import of a real dependency in `package.json`, not shadowed by a local binding |
| `TS-ERROR:5` | a project missing its deputy compiler options | rewritten, and it changes shape: the deputies are `tsconfig.json` settings rather than crate-root attributes, so the rule fires on the project, not on the file — **not built yet** |
| `TS-ERROR:6` | an `async` callback passed to `forEach` | rewritten and narrowed. The ancestor's target (a fallible absorbed by iteration) has no TypeScript form, but `forEach(async …)` silently drops every promise it makes, is a guaranteed bug, and is decidable |
| — | a caught unwind | moved to the `NODE` pack: the TypeScript form is `process.on('uncaughtException' \| 'unhandledRejection')` swallowing, which is server-side only |
| `TS-ERROR:7` | fallible work in a `[Symbol.dispose]` / `[Symbol.asyncDispose]` body | carries after all. First dropped as "JavaScript has no destructors" — it does now, and "few people use it yet" is the same budget argument. A rule for a construct nobody writes costs nothing while nobody writes it and is standing there the day someone does. The reasoning transfers exactly: dispose cannot propagate, so every failure it meets is swallowed by construction |

**`TYPE` — the signature is the contract.**

| id | bans | origin |
|---|---|---|
| `TS-TYPE:1` | an erased error type: `catch (e: any)`, a `throw` of a non-Error, `throw new Error(string)` where a typed error exists | rewritten — **not built yet** |
| `TS-TYPE:2` | `T \| undefined` / `T \| null` returned from an **exported** function | rewritten from the Option-on-a-public-surface rule; the failure is identical — the caller cannot tell "not found" from "found nothing" from "never looked" — and so are the exemptions: private functions, fields, locals and generics are untouched |
| `TS-TYPE:3` | `as any`, `as unknown as T`, `<T>expr`, and the non-null assertion `!` | carries, with a wider spelling list than its ancestor. TypeScript's `as` is worse than a numeric cast: it asserts *any* type, unchecked. This is pillar 4's centrepiece. Legal spellings: a schema parse, a type guard, `satisfies` |
| `TS-TYPE:4` | `any` in a written type position | new; distinct from `as any`, and with no counterpart in a language that has no `any` |
| — | a `Result` alias hiding its error half | **dropped.** The language has no `Result`. Deliberate absence |
| `TS-TYPE:5` | silent numeric mangling: `~~x`, `\| 0`, `parseInt` without a radix, unary `+` on a string, `.toFixed()` feeding arithmetic | rewritten and **constitutive**. First drafted as reactive on the grounds that it is "real but infrequent" — which is a budget argument, and there is no budget. Every spelling is precisely detectable and every one turns a decoding failure into a number that travels on, indistinguishable downstream from data that was always fine |

**`DEAD` — code not serving the program right now is noise.**

| id | bans | origin |
|---|---|---|
| `TS-DEAD:1` | `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable*` | carries in full, and it is what makes the deputies airtight: muting the deputy is the evasion the deputation exists to close |
| `TS-DEAD:2` | every comment — `//`, `/* */`, `/** */`, JSDoc | carries in full, and the case is **stronger here than in its origin**, because the primary reader is a model. Comments are high-signal in training data, so a stale comment does not merely fail to help — it overrides what the code says, to a reader who cannot check it. The ban is a relocation, not a silencing: a constraint becomes a type or an assert, an explanation becomes a name, rationale goes in the commit message where it is dated and attached to the change, prose goes in `.md` outside `src/` |
| `TS-DEAD:3` | `throw new Error('not implemented')`, an empty body on an exported function, `return null as any` | rewritten. The language has no `todo!`, so the spelling is the shape rather than the macro |
| `TS-DEAD:4` | `export *`; and `import * as` from a **local** module | carries, split in two — and the split is on the rule's own target, not on convention. What the rule bans is *anonymous* provenance: a name whose origin nobody can trace. `export *` is exactly that and is banned outright, barrel problem included. `import * as z from 'zod'` is the opposite — every use is `z.something`, so the origin is named at every call site. A namespace import from a local module still hides which layer you depend on, which is how `LAYER:1` gets fooled, so that half stays banned |

**`TRUTH` — every fact has exactly one home.**

| id | bans | origin |
|---|---|---|
| `TS-TRUTH:1` | **every spelling** of a default born outside the sanctum: `??`, `\|\|`, `??=`, `\|\|=`, a default parameter `f(x = 5)`, a destructuring default `{ x = 5 }`, `if (!x) x = 5`, and a spread merge over a defaults object | rewritten, and taken at full strength — the reasoning is below |
| `TS-TRUTH:2` | `process.env` and `import.meta.env` outside the declared files | carries in full: trivially decidable, and the same sin in the same shape |

**`LOG` — stdout belongs to the program's output.**

| id | bans | origin |
|---|---|---|
| `TS-LOG:1` | `console.*` outside the entry point | carries, and matters **more** here than in its origin: `console.log` is the language's default debugging idiom, so agent output is full of it |
| `TS-LOG:2` | `process.stdout.write` / `process.stderr.write` outside the entry point | carries; closes `TS-LOG:1`'s loophole exactly as its ancestor does — **not built yet** |

**What the audit added.** `TS-ERROR:8` has no ancestor: it was born from the
audit of 2026-08-17, which found that every check opened with "if the file could
not be parsed, return nothing", so one stray bracket exempted a file from the
whole law while still counting toward a clean report.

| id | bans | origin |
|---|---|---|
| `TS-ERROR:8` | a file that cannot be read as TypeScript at all | new here. A file nothing can parse is judged by no rule, and silence is indistinguishable from a clean file. It reports through the ordinary machinery, so an adopter carrying an unparseable file gets it baselined rather than blocked |

**`TESTS` — tests drive the public surface.**

| id | bans | origin |
|---|---|---|
| `TS-TESTS:1` | an export that exists only so a test can reach it | rewritten, and the ancestor's *rationale* is what failed to transfer rather than its spelling. A test beside its source cannot reach a module-private symbol in TypeScript — the language already prevents it — so banning the file location would enforce a convention rather than prevent a failure. The failure that does survive is widening the public surface forever to keep a private test — **not built yet** |

**What TypeScript rots by, that the origin set had no reason to name.**

- **Module-level `let`** — shared mutable global state, one keyword away at all
  times. A language whose statics are immutable by default never needed the rule.
- **`==` where `===` is meant** — coercion deciding equality in silence.
- **`JSON.parse` with nothing in front of it** — the `DATA` pack, with the SQL
  call-site rule already named above.

**Counts:** of the twenty-eight, **twelve carry unchanged**, **fourteen are
rewritten**, **one is dropped** as a deliberate absence — the `Result` alias,
because the language has no `Result` — and **one moves** to the `NODE` pack. Four
are added. Every rule that survives ships constitutive; nothing is held back as
reactive, because "real but infrequent" was a budget argument and there is no
budget. The categories all survive intact; `ERROR` and `TYPE` change the most,
which is the expected result — they are the two whose failures are spelled by the
language rather than by the culture around it.

**Three decisions this raised, all now taken.** Each would have changed a rule
rather than a wording, so each is recorded with its reasoning rather than
silently folded in:

1. **The floating promise has no gate. — Resolved 2026-08-17: it gets the slow
   pass.** It is the most common way TypeScript loses an error, and it is not
   decidable from single-file syntax: knowing a call finishes later is a question
   about a type the line does not state. `tsc` has no flag for it, so it cannot
   be a deputy the way the others are. The cost is paid rather than the failure
   left ungated — see "Two passes, at three moments".
2. **`TS-TRUTH:1` — Resolved 2026-08-17: taken at full strength, and it is the
   more precise reading, not merely the harsher one.** The worry was that `??` is
   common in legitimate TypeScript and that telling a default from a discharge
   would need judgment — a literal on the right is a default being born, a `throw`
   or a `return` is not. That judgment is exactly where the imprecision lived, and
   it only existed because the rule was being written leniently. Ban the
   construct outright outside the sanctum and there is nothing left to judge: the
   compliant path is always a **statement** rather than an expression, and a
   statement needs no type knowledge to recognise. Strict here is simpler to
   decide, and a rule with no judgment in it cannot misfire.

   The legal spellings, all statements, all available at every site:
   propagate — `if (x === undefined) throw new Missing()`; end the loop —
   `continue` / `break`; return early; or resolve it once in the sanctum, where
   the whole default set is one screen and one diff.

   **A default is a default however it is spelled**, which is why the ban covers
   the destructuring and default-parameter forms too. Pushing the fabrication into
   a parameter list does not push it out of the program: two components each
   defaulting the same prop differently is the two-sources-of-truth failure with
   nicer syntax. This will fire often on React code, and every firing is a real
   instance — volume is not imprecision, and the agent pays it.

   Three supports worth recording. The canon's frontend branch already bans ad-hoc
   colours and spacing inline for the same reason, so this is that principle
   applied to every default rather than only the visual ones. The prescribed
   `exactOptionalPropertyTypes` deputy already forces a project to distinguish
   *property absent* from *property present and undefined*, so a `??` collapsing
   both into a value is erasing a distinction the compiler was maintaining. And an
   optional parameter with no default — `f(x?: string)` — is untouched, because
   nothing is invented there.

   The sanctum is a **filename, not a path**: `config.ts`. Every package in a
   workspace may have one, so there is still exactly one place to read per unit of
   code, and the knob stays a single name rather than a list — a list is how "the
   one place to look" quietly becomes four.
3. **Cross-file rules need a home. — Resolved 2026-08-17: the same slow pass.**
   `TS-TESTS:1` and the unreferenced-export half of `DEAD` are whole-program
   properties a single-file engine cannot reach, and they are answered by the
   same whole-project read the floating promise needs. Two questions, one
   mechanism, which is why they were never really two decisions.

What remains of this table is the other half of its own specification: for each
rule, the repair prompt in full — why the rule exists, the legal spellings
written out as working code, and the valve where it has one. That is the artifact
the whole product rests on and it is deliberately not sketched here.

### Why not eslint as the checker

Because a project-configurable linter is not a law. Any rule can be switched off
in the project's own config, which is exactly what an optimizer does when
satisfying the check is the objective it was given. The law's concessions are
graded, visible in one diff, and never widened to make code pass, and that
property cannot be built on a config format the project owns.

Note that this argument now has to stand alone. While looper was going to be a
compiled binary there was a second reason — wrapping eslint would drag in Node,
`node_modules` and a child process per edit — and that reason is gone, because
we are Node. The remaining reason is the one that was always load bearing, so
the decision survives its own justification getting thinner. Running the law
*additionally* as an eslint plugin, purely to get editor squiggles while the
gates stay where they are, is a fine idea and it is deferred, not refused.

We do not reinvent **parsers**.

### Two tiers of language reader, on purpose

Four languages do not get equal depth, and pretending otherwise would ship a
uniform mediocrity. The engine is one; readers declare which tier they are,
and the engine refuses to load a rule that needs more than its tier provides.

**Tier A — deep. TypeScript, JavaScript, JSX/TSX, via `@babel/parser`.** A real
typed AST with scope and binding information, which is what the non-gameable
property needs: a rule can only verify a symbol's provenance if it can resolve
where that symbol came from. This tier gets the full rule set. It is also where
the overwhelming majority of the code and of the agent's edits live, and it
covers React, Next.js, Node and React Native with no second grammar — those are
rule packs on this AST, not separate readers.

`@babel/parser` over the TypeScript compiler API for two measured reasons: 12×
cheaper to load for the same parse speed, and `typescript@7` has removed the
classic syntax API entirely — the package exports two keys, with no
`createSourceFile` and no `ScriptTarget` — so building on it would mean pinning
a superseded 5.x line forever. Verified on 2026-08-17 against `typescript@7.0.2`
and `typescript@5.9.3`.

**Tier B — broad, and now deferred. Legacy languages via `web-tree-sitter`
(WASM).** Because the stack is prescribed and single-language, tier A covers all
new code, and tier B is no longer on the critical path. It is kept in the design
for one reason: the day judging a legacy Go or Java service is worth doing, the
shape should already be decided rather than invented under pressure.

The shape, when it is wanted: one substrate, one `.wasm` grammar per language,
no native modules and therefore no platform build matrix. It yields a CST rather
than a resolved AST, so rules are written as queries and the set is deliberately
thinner — only failures decidable from syntax alone. That is this plan's
standing preference applied honestly, **the rule set gets thinner rather than
the invariant getting weaker**, and a thin tier B beats no tier B.

Nothing about tier B is measured. Kotlin's grammar is materially less mature
than Java's or Go's, recorded now so it is not discovered as a surprise later.

### SQL needs no parser

The highest-value SQL rule is a TypeScript rule: a query call whose argument is
a template literal with interpolation in it. The failure happens at the call
site, in code tier A already parses. A SQL grammar would buy the ability to
judge migration files, which is worth having and is not worth a reader of its own.
Same reasoning retires most config-injection risks into the tier A packs.

### One repo, several languages

A Next.js frontend beside a Python backend is the common shape, not the
exception. So the law dispatches by file extension to a language reader, and `law.toml`
carries a shared top level plus one table per language:

```toml
max_loc = 500

[ts]
layers = { ui = ["lib"], lib = [] }
sanctum = "config.ts"
env_files = ["config.ts"]
trace_symbols = ["logger.warn", "logger.error"]

[ts.deputies]
tsconfig = [
  "strict",
  "noUnusedLocals",
  "noUnusedParameters",
  "noUncheckedIndexedAccess",
  "exactOptionalPropertyTypes",
]

[python]
layers = {}

[go]
layers = {}

[exempt]
"src/generated/schema.ts" = ["ALL"]
```

`sanctum` is a filename, matched by name in every package rather than one path in
the workspace, and it is deliberately a single name and not a list. `deputies`
are the compiler settings the law requires to be on, because a syntax-only engine
cannot see a type and these can — removing a name there removes a class of
failure from enforcement, so the list grows freely and shrinks almost never.

Rules are code and are compiled in; this file holds only concessions, the layer
maps and the exemptions. That split is the point: if rules were defined in a
file the project owns, the optimizer edits the file instead of the code.

The layer map ships **empty and inert** per language. An empty map is a project
stating it has no declared architecture, which someone can look at and change. A
map we invented on their behalf is one nobody reads and nobody trusts. The rule
set itself is the opposite and ships full: "do not silently swallow a rejected
promise" is not a project's architecture, it is how the language goes wrong.

### Two passes, at three moments

The engine has two passes, because one pass cannot have both properties the
product needs.

**The fast pass — one file, syntax only, no types.** It reads the shape of the
code and nothing else, which is what lets it answer in ~70 ms on a file that has
not been saved. Every rule in the table above is this pass unless it says
otherwise.

**The slow pass — the whole project, with types.** Some failures cannot be seen
from one file, and no amount of care makes them visible: whether an exported
function is used anywhere is a question about every *other* file, and whether a
call finishes later — the floating promise — is a question about a type that the
line itself does not state. Answering either means reading the whole project and
resolving its types, which costs seconds rather than milliseconds. So it does not
run on an edit. It runs at install, when the agent stops, and at commit.

The two are one engine and one report format. The slow pass is not a second
product; it is the same law, answering the questions the fast pass has to decline.

**Four moments, then — and not one of them is a person deciding to check:**

1. **PostToolUse**, the fast pass on the edited file. It fires after the file is
   written and can only hand back a repair prompt — it cannot revert the edit, so
   it is a fast repair loop and not a barrier, and the plan says so rather than
   calling it a gate.
2. **Commit**, both passes. The fast pass over the staged files, and the slow
   pass over the project, judged against the baseline below. This is the moment
   that refuses. Edit-time-only enforcement has a hole you can drive a whole
   session through: if the commit-time enforcer lives in a build recipe the
   project never runs and CI checks other things, a session that ignored the
   repair prompt commits the violating file and nothing stops it. Prose is not a
   control. Anything that must not happen is a gate or it does not exist.
3. **Install**, the slow pass as a survey. `init` on a repo that already has code
   runs it and reports, because that is the moment the question "what did I just
   point this at" is actually being asked. Not a separate command someone has to
   know to run — the moment that matters on an existing repo is the only moment
   we are guaranteed to have their attention.
4. **Stop**, the slow pass again, when the turn changed TypeScript. The agent has
   just finished a piece of work; a dead export it created or an `await` it
   dropped is cheapest to fix now, while the work is still in front of it, rather
   than at a commit that may be an hour away. It reports, it does not refuse —
   the commit is still the barrier. It carries a deadline and says nothing if it
   does not finish in time, because a governance accessory must never wedge the
   session it was only supposed to watch.

`looper law` exists as a command, but it is the author's convenience and the
debugging path, never the mechanism. Every one of the four moments above fires
without anyone deciding to run anything.

**Why the slow pass is not optional, and it is not mainly about promises.** On a
fresh project every file passes the fast gate as it is written, so file-by-file
coverage becomes complete on its own. On a project that already exists it never
does: the repo has five hundred files, the agent touches five, and the other four
hundred and ninety-five are never looked at by anything. Without a whole-project
pass, looper pointed at real existing work has no opinion about the work — only
about the edits. That is the majority case for adoption and it is the case the
fast pass structurally cannot serve.

**The slow pass reads the module graph with our own parser, and takes no type
checker. Decided 2026-08-17, on a measurement that overturned the plan.** The
intention was to drive the TypeScript compiler as a library for type answers.
Measured before adopting it: `typescript@5.9.3` is 23 MB, and
`node_modules/typescript/lib/_tsserver.js` requires the network modules, because
the language server opens sockets to talk to editors. We would never load that
file. It would still be in the resolved tree, and the invariant is about the tree
rather than about our own imports — that is the whole reason the check scans
`node_modules` instead of counting dependencies.

Three ways out, and only one is honest. Take it and narrow the socket check to
files we happen to load: that is widening a check to make code pass, which the
law forbids in someone else's project and cannot be excused in ours. Take it and
accept a socket-capable file in the tree: the first line of looper's own
constitution says no. Or answer the question without a type checker.

**The question is answerable without one.** "Does this call finish later" is
mostly a module-graph question rather than a type-inference question: resolve the
import to a file, parse it, and read whether the exported function is declared
`async`. That is the parser we already have, walking one edge further. It catches
a call to an async function declared in the same file, and to one imported from
anywhere in the project, following a rename at the import.

**And the packages are readable too, for the same price.** A TypeScript package
ships `.d.ts` declaration files, and `Promise<Result>` in a return type is
written there in plain text. A declaration file contains no runnable code at all
— the one `require(` in TypeScript's own 500,000-line declaration file is inside
a comment describing syntax — so reading one is not running anything, and it can
no more open a socket than a photograph of a telephone can make a call.

Better still, **nothing is installed to do it.** The project being judged already
has its own `node_modules` on disk. looper reads what is already there, which
means the tree looper ships stays exactly as small as it was.

**What is left uncaught, stated rather than discovered:** a promise reached
through a *value* rather than an imported name — `db.query(...)` where `db` came
from `new Pool()`. Following that needs the type of the receiver, which is where
real inference begins. Directly imported functions are caught, from your own
files and from installed packages alike, following a rename at the import.
A package that declares no types is passed over rather than guessed at.

### The baseline, because an existing repo starts non-compliant

Point the slow pass at a real codebase written before looper existed and it will
find hundreds of violations. That is not a bug in the pass; it is the truth about
the code. But a report of four thousand violations is not strictness — it is a
rule set that gets switched off in the first hour, which is the failure this plan
already names as how strict systems die.

So the first slow pass on an adopted repo writes a **baseline**: `.looper/baseline.toml`,
committed, recording per file and per rule how many violations exist today. The
gate then refuses **new** violations and stays quiet about the recorded ones.

Four properties keep it a debt rather than an amnesty:

- **It covers untouched code only.** A violation on a line the edit touched is
  never baselined, whatever the file's history — the agent is already in that
  file, with the repair prompt in front of it, and that is the cheapest moment
  the fix will ever have. This is the stricter reading and also the sounder one:
  a purely count-based baseline is gameable, because removing one violation and
  adding another leaves the count unmoved. Touched lines are not.
- **It can only shrink.** A count that goes down is rewritten down automatically
  on the next commit. A count that goes up refuses the commit. There is no path
  where the baseline grows without someone editing the file on purpose. The two
  rules together mean the debt erodes wherever work happens rather than sitting
  as a permanent floor.
- **It is visible, and visible where they already are.** The total rides the
  per-turn injection channel as one line while it is non-zero, and prints on every
  commit that changes it. `looper status` shows it too, but a number that only
  appears in a command nobody runs is not surfaced — it is stored.
- **It is not a pardon, and it must never be filed as one.** A pardon under
  `[exempt]` says *this rule does not apply to this file*. The baseline says
  *this rule applies and we are not compliant yet*. Conflating them would turn a
  debt into a permission, silently, which is exactly the move the graded
  concessions exist to prevent.
- **New files get none of it.** A file created after adoption is judged in full
  from its first line. The baseline covers what was already there, never what is
  written next.

The effect is that adoption is honest in both directions: the existing code is
not pretended to be compliant, and the team is not asked to fix four hundred
files before the tool does anything for them.

## How looper runs once it is installed, which is not how it runs here

**Settled 2026-08-18, after the advertised install was found dead.** looper's own
source is TypeScript run by type stripping, with no build step. An install puts
that source under the adopter's `node_modules`, and Node refuses to strip types
from any file below that directory. On Node 22.23.2, in an empty project, the two
lines at the top of `README.md` produced this and nothing else:

```
Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]: Stripping types is
currently unsupported for files under node_modules, for
".../node_modules/looper/src/main.ts"
```

No hooks written, no `.looper/`, no gate — for every adopter, from the first
command in the README. A global install lands under a `node_modules` directory
too, so it fails identically. Three routes out, and two of them were rejected:

- **Compile to JavaScript at install time**, with a `prepare` script. That runs
  our code on the adopter's machine before anyone has read a line of it, which is
  the exact act `tests/invariants.test.ts` forbids a *dependency* from doing. A
  rule we enforce on others and suspend for ourselves is not a rule. It would
  also need a compiler dependency, argued against everywhere else in this file.
- **Commit the compiled JavaScript.** Two copies of every source file, kept equal
  by a freshness gate that has to be right forever. The generated half is what
  actually runs, so a stale one is a bug nobody can see by reading.
- **Strip the types ourselves, at startup.** `bin/looper.js` is plain JavaScript,
  so Node loads it under `node_modules` without objection. It registers a
  synchronous load hook — `module.registerHooks`, in Node since 22.15, and we
  already require 22.18 — that hands Node the stripped source for looper's own
  `.ts` files, then imports `src/main.ts`. No build, no dependency, no code at
  install time, and one copy of the source.

The third is what is built. **What it costs, measured 2026-08-18 on Node
22.23.2, 20 runs of each:** `--help` 90 ms → 92 ms, `status` 88 ms → 92 ms,
`law` over a one-file project 96 ms → 97 ms. On the heaviest path, which is the
one that runs on every edit, the shim costs about a millisecond.

`tests/installed.test.ts` is the gate: it copies the package into a real
`node_modules` directory and runs `init` there, which is the thing that failed.
It also asserts that Node still refuses `src/main.ts` on that same path — the day
that restriction lifts, that test fails and the shim can be deleted.

Working inside this repository is unaffected: the `dev` invocation still runs
`node ./src/main.ts` straight from the checkout, where type stripping works.

**Which Node versions this was run on, 2026-08-18.** The suite passes on 22.23.2,
24.19.0 and 26.7.0 — 333 tests, three times. A packed install wires a project and
refuses a bad commit on 22.23.2 and on 26.7.0, so the newest Node is covered by
the same evidence as the oldest supported one. The matrix in
`.github/workflows/test.yml` names 22.18.0, 24.x and 26.x for the same reason:
looper is installed into somebody else's project, and their Node is not ours.

**A Node too old to run looper says so.** Below 22.18 there is nothing to strip
types with, and the failure was a stack trace about a missing export. The shim
now checks for the two things it needs and prints one sentence naming the version
it is on and the version it needs — verified on Node 22.10.0. It exits 1, which
the commit hook reads as "could not check" rather than a refusal, so an
unsupported Node fails open and says so, exactly as everything else here does.
The check is reachable only because `bin/looper.js` imports `node:module` whole
rather than by name: a named import of something an old Node lacks fails at load,
before any message of ours can print. `tests/installed.test.ts` holds that.

## Init: merge, never clobber

Four rules for every file we do not own, and the second one is the whole of
property 2 above.

- **Merge, never clobber.** Add our entries to the existing structure and leave
  every other key alone. Where a project already has a hooks directory, our hook
  files go into it rather than into a second one, because `core.hooksPath` is
  single-valued and two directories means one of them silently never runs.
- **Never report success for a file we did not wire.** Skipping a file that
  already exists and printing `skipped (already there)` reads as success and is
  not: on a repo with any pre-existing `.claude/settings.json`, the entire
  governance layer would be absent while the output looked clean. That failure is
  easy to ship and nearly invisible afterwards, which is why init is a merge from
  the first line of code rather than a later fix.
- **Atomic with backup.** Temp file alongside, fsync, rename, keep the prior
  version. A half-written settings file breaks the whole session.
- **Idempotent.** Twice is indistinguishable from once, which is what makes it
  safe to call from inside a session.

**`core.hooksPath` is never set by us, and never needed to be. Settled
2026-08-17, after two wrong turns.** The original decision was that writing hook
files is ours and turning them on is the user's. Then that was revised to "init
asks and sets it", on the reasoning that the only real barrier in the product sat
behind a command line a non-coder would never type. Both were reasoning about a
question that measurement dissolved: **git runs `.git/hooks/pre-commit` with no
configuration at all.** Verified — a hook written there fired and refused a
commit in a repository with `core.hooksPath` unset.

So init writes into the directory git already looks in: whatever `core.hooksPath`
names if the project set one, and `.git/hooks` otherwise. The gate is live the
moment init finishes, nobody types anything, and `core.hooksPath` is neither read
as a requirement nor written. The original decision stands and the revision was
solving a problem that did not exist.

What that costs, stated plainly: `.git/hooks` is not committed, so a teammate who
clones runs `looper init` once. The agent-side gate *is* committed, in
`.claude/settings.json`, so a fresh clone is still governed on the path that
matters most before anyone does anything.

**A hook the project already wrote is never overwritten.** A shell script cannot
be merged the way a settings file can, so init leaves it exactly as it is,
reports the gate as **not wired**, and prints the one line to add. Reporting a
gate as installed when it is not is the failure this whole section exists to
prevent.

**Only a real verdict refuses.** The hook exits non-zero only when looper reached
a verdict of "block". If looper is missing, broken, or unreachable, the commit
goes through with a line saying it was not checked. The first version got this
wrong in the most instructive way: it used the agent hook's entry path, which
resolves through an environment variable Claude Code sets and a shell does not,
so every commit was refused because node could not find a file. A governance
accessory refusing on its own failure is the worst outcome available to it, and
it is what "fail open" means in practice.

**And init must not gitignore the agent config directory:** hooks are executable
code running with the agent's privileges, so they belong in the diff where a human
reviews them.

**What init never writes:** the project's long-form instructions file. The canon
already carries the generic law, so a fresh project is governed on day one, and
the project-specific half is the author's to write. Generating it would be
inventing doctrine nobody agreed to.

## Adoption: rules the project earns, ratified by evidence

On an existing project the doctrine tree starts empty, and demanding it upfront
is how this tool would get abandoned in week one. So the tree fills in from use.

`looper adopt` reads the repo and finds candidates: the layers visible in the
import graph, a symbol the project has clearly banned, a convention it already
follows everywhere but once.

**Reversed 2026-08-17: a human does not ratify these, and the earlier design was
wrong on its own terms.** It said proposals land in a pending file and a human
moves a line into a branch to make it doctrine, on the reasoning that an agent
able to ratify its own doctrine has built an elaborate way of talking to itself.
That reasoning is sound about *judgment* and it was applied to the wrong reader.
The person here cannot read code. They will either wave every proposal through,
which makes the ratification theatre, or never open the file, which leaves the
tree empty forever — and the second is what actually happens. A gate only a
qualified reader can operate is not a gate on a project that has none.

It also contradicts a decision already taken. The canon names three things that
earn a question: what the thing should do, what costs money, what cannot be
undone. Adopting a rule is none of them.

**Evidence ratifies instead, and the bar is mechanical rather than argued.** A
candidate becomes a rule only when all four hold:

1. **It fires on real code in this project.** Not a hypothetical — a line that
   exists. This is "rules grow only on evidence", applied where the evidence has
   to be local.
2. **Every instance it fires on gets fixed.** The agent rewrites each one. A rule
   whose instances cannot be rewritten is not strict, it is broken, and this is
   the test that catches it without anyone having to judge.
3. **The project still passes afterwards.** Its tests, its build, whatever it
   already has. A fix that breaks the project disproves the rule.
4. **The evidence is recorded with the rule** — the file and line that justified
   it, and the rewrite that discharged it. A rule with no recorded instance can
   be deleted by anyone, because nothing shows it was ever needed.

Together these prove what a human reviewer would have been asked to judge: that
the rule is real here, that it can be obeyed, and that obeying it costs nothing
the project cannot pay. None of that needs an opinion.

**An adopted rule is an instance of a shape looper already knows, never new
code.** A banned symbol, a banned import, a layer map entry, a required
construct at a boundary. The engine ships the shapes; the project supplies the
particulars. This is the same split as `law.toml` holding concessions rather than
rules, for the same reason: the moment a project can author executable rules, the
optimizer edits the rules instead of the code.

**And an adopted rule only ever blocks new code.** Adoption baselines everything
currently violating it, so the rule stops the next instance and never strands
anyone in work they did not ask for. That machinery already exists and adoption
gets it for free — which also means a wrongly adopted rule costs a deletion
rather than a crisis.

## The return path: every adopter's agent is a rule tester

The rule set grows only on evidence, and the plan has never said where evidence
comes from. This is where: **the agents using looper are the only witnesses to
its defects, and they are perfect witnesses.**

A human adopter never reports a misfiring rule. They get stuck, assume they are
the problem, and eventually stop using the tool — the failure is silent and the
first we hear of it is that nobody runs it. The agent is the opposite. It hits
the rule, tries the legal spellings the repair prompt handed it, fails, and knows
precisely what happened: which rule, which construct, which spellings it tried,
and why each was refused. That is a better defect report than any human would
write, and it costs nothing to collect.

It also closes a sentence this plan already contains and could not honour: *a
violation the agent cannot discharge is our defect, recorded as one.* Recorded
where? Here.

**looper does not send it. The agent does.** This is not a compromise around the
no-network invariant, it is the only correct shape. looper stays incapable of
opening a socket — that is the first line of its own constitution and the reason
a tool running on every edit and every commit is allowed anywhere near a private
codebase. The adopter's agent already has network access, already has whatever
client their host uses, and is already watched by whoever is sitting there. So
looper produces an artifact and instructs; the agent transports. The thing that must be trustworthy
never gains the capability, and the capability lives where it was already granted
and already visible.

**Four constraints, and the second is the hard one.**

1. **Opt in, off by default, and visible.** A governance tool that quietly emits
   anything is finished the first time someone notices. The adopter turns it on,
   and every report is written to a file they can read before it goes anywhere.
2. **The report carries the shape, never the source.** A rule fired on a
   construct; what we need is the minimal construct that reproduces it, not the
   file it lived in. Not their identifiers, not their paths, not their business
   logic. This is a real design problem and not a disclaimer: the agent must
   reduce a real violation to a synthetic fixture that still fires the rule, and
   a report that cannot be minimised is a report that does not get sent. Our own
   audience rule applies with force — the person running this cannot judge what
   is safe to disclose, so the mechanism has to guarantee it rather than ask.
3. **Adopters install, they do not fork.** The canon is compiled in precisely so
   it "cannot drift into N copies", and fifty adopter forks are N copies: a fix
   argued against rules we did not ship, from a version we cannot identify. Forks
   are for the few people changing looper itself. Every report therefore names
   the exact version it came from.
4. **The report is a file, and how it travels is not ours to decide.** looper
   writes a report and says what it is for. Whether it becomes a GitHub pull
   request, a GitLab merge request, a ticket, or a message pasted to someone is
   the adopter's business and their agent's tools. Nothing in looper knows the
   name of a hosting provider, and nothing should: the whole engine speaks plain
   git — `diff`, `show`, `ls-files`, `diff-tree` — which is identical on every
   host and works in a repository with no remote at all.
5. **What the agent is told is doctrine, not code.** The canon gains the rule:
   when a looper rule blocks you and no legal spelling discharges it, that is
   looper's defect and not yours — do not edit looper, do not disable the rule,
   produce a report. Installed in `node_modules`, looper is already effectively
   read-only, so the instruction that carries weight is the positive one, and it
   belongs in the canon because it is true for every governed project.

**What this is really buying.** Not bug reports — a rule set with a supply of
real bypasses, which is the only thing the "never speculatively" bar will accept.
Every adopter is a language surface we do not have, hitting constructs we would
never have invented, and reporting them in the exact terms the rule table is
written in.

### Public or private, and the half of it that is decided

The repo is private today and the question of opening it is live. Three things
are settled and one is not.

**Settled: the canon is already public.** It compiles into the package, so every
adopter reads it. Opening the repo changes nothing about that half.

**Settled: it is all or nothing.** Engine public with the plan held back is the
obvious compromise and it does not work here, because PLAN.md is written before
the code and corrected in the same commit as the work. Split them and the record
drifts from the thing it records, which is the rot this whole design exists to
prevent.

**Settled: write everything as though it will be public, starting now.** This
costs nothing and removes the retrofit, and it is the better discipline anyway —
reasoning aimed at a skeptical outside reader is sharper than reasoning aimed at
oneself. The genericity test already enforces most of it.

**Decided: it goes public, and the design assumes it from now.** The argument is
not adoption or contribution, it is **verifiability**. looper installs hooks that
run on every edit and every commit inside a private codebase. "It cannot phone
home" is a promise while the source is closed and a five-minute check once it is
open: the socket ban, the zero dependency count, the absent lockfile, one test
file. For a tool with this reach, being auditable is worth more than the rule set
is worth hiding, and the rule set is not hideable anyway.

**One repo, everything in it, and that reverses the "all or nothing" worry
above.** That worry assumed the cut was engine-public and plan-private, which
fails because PLAN.md is corrected in the same commit as the code and a split
lets the record drift from what it records. The resolution is not a cleverer cut,
it is that **there is nothing in the plan worth withholding.** The reasoning is
the strongest evidence the tool is what it claims to be, which for a governance
product is closer to the pitch than to a leak. The scar log is a list of the
author's own mistakes. Neither is a moat, and the mechanical cost of splitting
them is real.

**Measured rather than assumed, 2026-08-17:** with only `src/`, `tests/` and the
manifests, 53 of 55 tests passed. The two failures were MCP tests asserting on
looper's own doctrine, using private files as fixtures — a coupling that was
wrong regardless of publishing, and now fixed with a fixture project under
`tests/fixtures/`. The public artifact stands alone because it was checked, not
because it looked like it would.

**One guard, and it is the only ongoing cost.** The scar log's value is naming
real failures precisely. Today every scar is ours. Once the return path is
running, a scar could name an adopter's situation, and that is the line: an
incident from an adopter is recorded as the construct and the rule, never as the
company, the codebase or the person. Same discipline the canon is already held to
by the genericity test, applied one directory over.

**Sequencing.** The switch waits for the law engine, because there is nothing to
judge the tool by until then and a first impression is expensive to redo. What
does not wait is writing as though it is already public, which costs nothing, and
the licence, which is needed before the switch and is the one decision here that
is legal rather than technical: a permissive licence maximises adoption, and an
explicit patent grant is what corporate legal teams look for.

**What this simplifies.** The return path below was designed around inviting
people to a private repo, with the report travelling by a mechanism we build. In
the open it is an issue or a change request against a repository the adopter's
agent can already reach with tools it already has. The minimiser still matters —
a report must carry a synthetic reproduction and none of the adopter's source —
but the transport stops being ours to invent.

## The chunks

Each chunk leaves the tool usable rather than half-built, and no chunk depends on
a later one existing.

### Chunk 0 — the container

MCP server on stdio, capability trait, registry, hook dispatch, the injection
allocator, and the CLI: `init`, `inject`, `hook <event>`, `status`, `freshness`.
Ships `router` only, and knows nothing about any language.

**Done when:** a live Claude Code session in a scratch repo shows the injected
doctrine, `looper status` reports its char cost, and `init` run against a repo
that already has an agent settings file with a foreign hook leaves that hook
intact and adds ours beside it. Twice equals once, byte-identical.

### Chunk 1 — the canon

The generic doctrine compiled into the binary: the constitution plus the
language-neutral branches. The bar for a canon line is the same bar the whole
product rests on: a line a model would not reliably follow unprompted. Lines that
restate what it already does make it hedge more, not less.

**The canon is the published half of this repo, and that is the reason for the
genericity check rather than merely its result.** The engine, this plan and
looper's own doctrine stay private; the canon ships inside the distributed
package, so every adopter can read every line of it. Anything written there is
written in public. A canon line therefore carries a second test beyond "would a
model follow it unprompted": would we be content for every adopter, and everyone
they show it to, to read it.

**Done when:** a project with a completely empty doctrine directory still
receives real rules every prompt, and a genericity check over the canon proves no
host-project vocabulary entered it.

### Chunk 1b — `secrets`, because depth 1 was two capabilities short

**Built 2026-08-17.** `secrets` and `recall` are named as v0.1 capabilities and as
most of what depth 1 is, and neither appeared in any chunk — a scheduling gap in
this plan, not a design one, and the kind that is only visible from outside.
`secrets` is built here because it is the failure that cannot be walked back: a
key that reached history is not fixed by a later commit, since every clone
already has it.

**Shape, never a list of names.** A list of key names cannot cover a vocabulary
someone else owns, so detection reads shape: vendor-prefixed tokens, a private
key block, a connection string carrying its password, something named like a
credential holding a real value, and a high-entropy string that is not a hash or
a uuid. It reads **added lines only**, so a project adopting looper is not
refused every commit over something already in its history.

**The message carries the fact people get wrong under pressure:** deleting it
later does not help. Rotate the key. That sentence is the entire point of the
capability, and a scanner that blocked without saying it would leave the leak
open while feeling solved.

**Language-agnostic, so it is depth 1 in full.** It scans every staged file, not
only TypeScript — a `.env` in a marketing team's repo of scripts is exactly the
case this exists for.

### Chunk 1c — `recall`, and it is committed rather than local

**Built 2026-08-17**, completing the four v0.1 capabilities. Durable project
memory: what took work to find out, kept where the next session reads it.

**Committed, which reverses the prior art.** There, recall is local working state
and gitignored. That is wrong here for a reason worth stating: a note nobody else
can see is a note nobody can correct, and a wrong note is worse than none because
it is believed. Committed, a stale memory shows up in a diff and gets deleted. It
also becomes shared, which is where its value actually is — "why we abandoned
that approach" is worth most to the person who was not there. `secrets` already
scans every staged file, so the obvious objection is already gated.

**The format carries the defences, because rot is the whole difficulty.** Every
note has the date it was learned. Writing the same summary again replaces it, so
correcting is the cheap path and duplicating is the awkward one. Removing is one
call. The file is plain markdown a human can fix by hand.

**And the tool description carries the bar,** since that is what the model reads:
what earns a place is something that took work to find out and is written nowhere
else. What does not is anything the code, tests or git history already say; a
version number or path, which goes stale silently; and one session's stumble
written as permanent law, which makes every later session steer around a pothole
filled months ago. A note earns its place by helping the next session, not by
having surprised the last one.

### Chunk 2 — the law engine, language-neutral half

Everything about the law that is not a parser: the rule and category and
violation types, the report format that carries the repair prompt, the `law.toml`
loader with the three graded concessions and the per-language tables, the file
walker, the extension dispatch, and all four wirings (PostToolUse, install, Stop,
and commit).

**Both passes are shaped here, not just the fast one.** A rule declares which
pass it belongs to and the engine refuses to run it on the other, the same way a
language reader declares its tier. The baseline — read, compare, shrink, refuse a
growth — is engine machinery and lands here too, because retrofitting it after
rules exist means every rule written before it assumed the wrong verdict model.
The type source is measured in this chunk rather than assumed: which TypeScript
compiler API answers "is this a promise", on which version line, at what cost
over a real project.

Ships with zero rules, which makes it a config format until chunk 3. That is
worth saying out loud rather than discovering.

**Done when:** one hand-written fixture rule fires on a fixture file and the
report carries id, location, why, legal spellings and valve; deleting `law.toml`
changes no verdict; and a fixture project with a baselined violation commits
clean while the same violation added to a second file refuses.

### Chunk 3 — TypeScript and JavaScript

Tier A, and the language reader that carries most of the value. Step (a) is already
done and its numbers are recorded above, which is why this chunk now starts at
the rule table rather than at a measurement.

- **(a)** ~~Prove the parser.~~ **Done 2026-08-17.** `@babel/parser`, 8.8 ms
  load, 38 ms for a 1,562-line TSX file, 2.4 ms to walk 12k nodes. What remains
  from this step is the dependency audit — the no-network check over the
  resolved `node_modules` tree, plus a postinstall-script audit, which is a
  different job in npm than it was in Cargo.
- **(b)** Write the TS/JS rule table. **Derived 2026-08-17** — the table is above,
  under "The TypeScript rule table": every rule with its category, what it bans,
  and whether the failure it catches survives into TypeScript unchanged, changes
  spelling, or does not exist here at all, with the deliberate absences recorded.
  What remains of this step is the repair prompt for each rule — why it exists,
  the legal spellings as working code, the valve where it has one — which is the
  artifact the product rests on and is the bulk of the work, not a formatting
  pass over the table.
- **(c)** Implement the shared-category rules from (b), with provenance checks
  anywhere a rule names a symbol.
- **(d)** Add the rules that exist only because TypeScript rots its own way.
- **(e)** The slow-pass rules: the floating promise, the unreferenced export, and
  the test-only export. Three rules, one mechanism, and they are the reason the
  slow pass exists at all.

**Done when:** every rule has a fixture file with a hand-checked expected report,
the whole fast set judges one unsaved file inside the budget, and the slow set
judges a real existing repo and produces a baseline.

### Chunk 4 — the tier A rule packs: React, Next.js, Node, Data

No new parser. Four packs on chunk 3's AST, and React Native comes free with the
React pack because it is the same grammar and the same hooks. These packs may
assume the prescribed stack, which is what makes them sharp rather than generic.

`REACT` starts at the failures already evidenced across the ecosystem rather
than invented here: a hook called conditionally or in a loop, an effect whose
dependency list lies. `NEXT` is the server and client component boundary, which
needs the layer map — that is why `LAYER` for TypeScript lands here and not in
chunk 3. `NODE` is the server-side set, and the first entries translate cleanly
from failures we have already seen in another language: environment access
outside the declared config file, and a child process built from an interpolated
string. `DATA` is the stack-specific pack: the SQL call-site rule above, a
Drizzle query assembled by string concatenation, and an API boundary that
accepts input without a Zod schema in front of it.

**Built, and this table is the record of it.** The prose above described four
packs and named no rule in any of them, which the audit of 2026-08-17 recorded
as finding 27 — four of the five missing were the security rules, so the
highest-stakes part of the program had no design record at all.

| id | bans | origin |
|---|---|---|
| `REACT:1` | a hook called inside an `if`, a loop, or after an early `return` | the ecosystem's own most-hit failure. React matches hooks by counting them in order, so a conditional one returns somebody else's value |
| `REACT:2` | an effect whose dependency list leaves something out | the list is a promise React believes. What is left out stops the effect re-running, and the screen keeps showing what was true a minute ago |
| `DATA:1` | a database query built by pasting values into its text | the oldest exploited mistake there is, and the safe spelling is shorter to write |
| `DATA:2` | using what arrived from outside without checking it first | the type you wrote down is a wish until something checks it |
| `NODE:1` | a command for the operating system built by pasting values into it | a shell reads punctuation as instructions, so a filename someone else chose becomes a second command |
| `NEXT:1` | reading a setting that is not marked public, in a file that runs in the browser | a `"use client"` file is sent to whoever opens the page, settings and all |

Grows only on caught bypasses. Inventing framework rules before we have hit the
mistakes is the speculative rule writing the bar forbids.

### Chunk 5 — adoption

`looper adopt`, the pending-proposals file, the ratify path, and the freshness
gate learning to stay quiet on a repo whose doctrine is still empty.

**And the first slow pass, run as a survey by `init` itself.** Adoption is the
moment a repo full of code written before looper existed meets the law for the
first time, so the survey runs as part of installing — not behind a second
command, because the person who most needs the answer is the person least likely
to know to ask for it. It reports what is there in plain terms and writes the
baseline. That report is the honest first answer to "what did I just point this
at", and it is the one output a team on an existing project will actually read
before deciding whether to keep the tool. `adopt` stays what it was: the doctrine
proposals, which do need a human, because ratifying doctrine is a judgment and
surveying code is not.

**Done when:** run against a real existing project, nothing changes except files
looper owns; a candidate rule that fires on real code, is fixed everywhere it
fires, and leaves the project passing becomes a rule with its evidence recorded
beside it; a candidate that cannot be fixed everywhere is refused and says why;
and the survey plus baseline let the next commit pass without a single rule being
disabled to get there.

### Chunk 6 — the return path

`looper report`, the minimiser, and the canon line that tells an agent what to do
when a rule cannot be discharged. With the repo open, the transport is an issue or
a change request the adopter's agent can already open with tools it already has,
so this chunk is the minimiser and little else. It lands after chunk 4 because it needs a rule
set worth reporting against, and before anything in chunk 7, because every week
it does not exist is a week of evidence nobody collected.

The minimiser is the whole of the work and the rest is plumbing: reduce a real
violation to a synthetic fixture that still fires the rule, carrying none of the
adopter's identifiers, paths or logic. A violation that cannot be reduced is not
reported.

**Done when:** a rule fires on a fixture in a repo looper has never seen, the
agent produces a report naming the version, the rule and a minimal reproduction,
a human reads the file before it leaves the machine, and nothing in it came from
the adopter's own source.

### Chunk 7 — named so it is not mistaken for forgotten

**Tier B, if a legacy Go or Java service ever earns the law.** The substrate
first, proved on one grammar, then each further language as a `.wasm` plus a
rule pack. Designed above, not built.

The law republished as an eslint plugin, for editor squiggles only, with the
gates staying exactly where they are. A SQL grammar, if judging migration files
ever earns a reader. Swift and Kotlin-for-mobile, if the apps ever stop being
React Native. `reuse`, once there is a substrate for it. A UI.

Not here: a Rust language reader. Its only justification was that an engine already
existed to be wrapped, and that justification is withdrawn. It rejoins the queue
at the value of any other new language reader, which is to say behind the
languages an adopter actually ships.

## Rust, the backend language, read at full depth

**A note on one word, because it caused a real misreading.** This document has
used "front end" in the compiler sense — the part of the law engine that reads a
given language — in a document that also uses it for Next.js and React. The two
meanings are opposites in a sentence about a Rust backend, and on 2026-08-17 a
reader took "a Rust front end" to mean a Rust user interface, which is the
reverse of what was meant. The constitution's first rule is that everything
written here reads to someone who cannot read code, and a term that inverts its
own meaning fails that. It is **language reader** everywhere below and above.

This section is about the **backend** — the web framework, the async runtime,
the database layer and the crate configuration around them, all named in
STACK.md. Nothing in it proposes writing a user interface in
Rust.

### This reverses a decision, and the old half is kept

Chunk 7 said, and still says: *"Not here: a Rust language reader. Its only
justification was that an engine already existed to be wrapped, and that
justification is withdrawn. It rejoins the queue at the value of any other new
language reader, which is to say behind the languages an adopter actually
ships."*

That reasoning was right and is not withdrawn. What changed is the condition it
named: **an adopter ships Rust.** A Rust backend, a TypeScript front end, and
Tauri joining them in one repository. The queue position argued for
was "behind the languages an adopter actually ships", and Rust has moved to the
front of that queue by satisfying it rather than by being argued for again.

Recorded this way because a reversed decision keeps both halves, or the same
argument returns in a month.

### What is easy, and what is not

Easy, and genuinely so: **detecting which stack a project is**, routing files to
the right language reader, a second doctrine branch, one baseline and one report
across both languages, and most of the rules. The engine has been
language-neutral since chunk 2 — `judge(checks, pass, subject, concessions)`
knows nothing about TypeScript, and the categories, the report, the baseline,
the concessions and the graded valves are all already shared.

Hard, and it is one thing: **reading Rust at all.** Everything below is
downstream of that decision, so it is taken first and in the open.

### The parser, which was the whole problem, and is not any more

Four ways in were weighed and three closed. Then the fourth turned out to be a
fifth, and the analysis is kept in full because it was wrong in a way worth
remembering.

**What was closed, and still is.** `web-tree-sitter` is not in this machine's
npm cache, so the WASM substrate cannot be installed under the no-network rule —
closed on availability rather than merit. `cargo check` yields diagnostics rather
than a tree and costs seconds against an edit gate whose whole budget is ten
milliseconds — closed there, still a candidate for the slow pass. A helper crate
built on `syn` from crates.io breaks the no-network invariant to save writing a
lexer — closed.

**What was chosen, then unchosen.** A Rust lexer and item reader written here in
TypeScript: 400 to 600 lines, exact, no types. That was the plan for about an
hour.

**What was actually true.** The Rust predecessor did not write a Rust law
either. It drove one — Zmole Cristian's `lawkeeper`, incorporated as a library
and pinned to a reviewed commit. That engine is **3,914 lines across 14 files**,
parses Rust with `syn`, depends on `syn`, `proc-macro2`, `serde` and `toml` and
nothing else, and is licensed **0BSD**, which permits copying with no attribution
required. Its rule set is the ancestor the TypeScript table in this document was
derived from, rule for rule.

So the question was never "how do we read Rust". It was "why would we write a
second one". **Resolved 2026-08-17: copy it in and drive it.** It now lives at
`vendor/rust-law/`, renamed for what it does here rather than where it came
from, with its provenance recorded beside it in `PROVENANCE.md`. Its own
command-line and MCP surfaces were dropped; one narrow program, `looper-rust`,
takes a project root and optionally a list of files and prints violations as
JSON. Nothing else.

Measured on the day it landed: **builds offline in 13.5s** against the cargo
cache already present, and judges a whole real project in **14ms**. A file
written to break it returned `.unwrap()`, a discarded `Result`, a lossy `as`
cast and an `#[allow]`, at the right lines.

**What this costs, and it is not nothing.** looper stops being one language. A
project with a `Cargo.toml` pays one `cargo build` the first time and needs the
toolchain — which it has by definition, since it is a Rust project. A
TypeScript-only project never touches any of it. And 3,914 lines of somebody
else's code are now in this repository, updated by hand and deliberately or not
at all, which is the price of never downloading anything.

**`rustgraph` is not taken.** The earlier project used it beside the law for call
graphs and "who calls this". The law engine does not depend on it, and what it
serves is the `reuse` capability, which this plan has deferred since chunk 7.
Checked rather than assumed on 2026-08-17.

**What is still ours to write.** The engine reports a rule id, a file and a
line. Every word a person reads — the ban, the reason, the legal spelling — is
written here, in the voice the rest of the law already has, and keyed by id. The
audit found the rule prose to be the best-made part of this project; the Rust
half gets the same prose or it is not the same tool. The engine's own help text
is not carried over.

### In Rust the compiler is already the deputy, so the law is smaller

This is the reframing the whole Rust reader rests on, and it is not a
concession.

TypeScript's law is large because `tsc` is weak: it will not tell you a promise
was dropped, that a value came from outside unchecked, or that an error vanished.
`TS-ERROR:1` exists and needs a slow pass with a module graph precisely because
the compiler declines to answer.

`rustc` answers. An unused `Result` is `#[must_use]` and already a warning. A
dropped future does not compile. Data races do not compile. Use-after-free does
not compile. Half of what the TypeScript law spends its effort on is not
reachable in safe Rust.

So the Rust law divides in two, and the cheaper half is the larger:

**Appointed deputies — enforced by reading configuration, not code.** A crate
declares its lints in `Cargo.toml` under `[lints.clippy]` and `[lints.rust]`, at
`deny`. `unwrap_used`, `expect_used`, `panic`, `indexing_slicing`,
`unsafe_code`, `missing_docs` where it applies. looper's rule is that the table
exists and denies the named set — it does not re-implement clippy, it checks
that clippy was appointed and not muted. This is `TS-ERROR:5`'s shape, it costs
a TOML read, and it is the single highest-value rule in the Rust pack.

**What compiles clean and is still wrong — enforced by the lexer.** `unwrap` in
production code, `panic!` as control flow, `unsafe` without a stated reason,
`#[allow]` as a silencer, a query built by `format!`, a command built by
interpolation, a blocking call inside an `async fn`, `println!` in a library,
`std::env::var` scattered. None of these need types.

### The Rust rule table

Twenty-eight rules come from the engine and are listed below exactly as it
enforces them. Categories are the existing ones — `SECURITY`, `ERROR`, `TYPE`,
`DEAD`, `TRUTH`, `LOG`, `DECOMPOSITION`, `LAYER`, `TESTS` — because a break-in is
a break-in in either language and the report should not learn a second
vocabulary.

**This table replaced an earlier one, and the reason is worth keeping.** The
first version was written from a design before the engine had been read. The
rules were then written from the engine and the table was never reconciled, so
for a day the document described six ids as banning something other than what
they ban — and two of those six promised rules that do not exist at all. The
audit of 2026-08-17 found it, `tests/plan-is-true.test.ts` now compares each row
against the rule it names, and there is one table rather than two.

**Not built, and named so they are not mistaken for covered.**

| id | would ban | why it is not here |
|---|---|---|
| `RUST-ERROR:10` | a blocking call inside an `async fn` — `std::fs`, `std::thread::sleep`, blocking `reqwest` | **not built yet.** Tokio's most expensive quiet failure: the executor stalls and nothing errors. The engine does not cover it and looper has no Rust reader of its own, so building it means either extending the vendored engine or writing one |
| `RUST-TYPE:6` | an `unsafe` block outside a module declared for it | **not built yet**, and there is a real answer that is not a rule: `#![deny(unsafe_code)]`, appointed as a deputy under `RUST-ERROR:5`. That is off unless a project declares it, which is the honest state of things |


**What the engine also carries, and the table above did not name.** Thirteen more
rules came with it, and the control in `tests/plan-is-true.test.ts` refused this
document until they were written down.

| id | bans | origin |
|---|---|---|
| `RUST-DECOMPOSITION:1` | a file longer than the cap | carries |
| `RUST-DECOMPOSITION:2` | `lib.rs` or `mod.rs` holding anything but wiring | the barrel rule, and sharper here: an inline `mod x { … }` hides a file's worth of code from every per-file rule |
| `RUST-DECOMPOSITION:3` | a function longer than the cap | carries. In a language with no comments the names of the stages are the whole explanation |
| `RUST-LAYER:1` | a `use` crossing the declared layer map | carries; off until a project declares its layers |
| `RUST-LAYER:2` | a `crate::` / `self::` / `super::` path outside a `use` | the top of the file is meant to be the complete list of what it needs |
| `RUST-LAYER:3` | a `static` whose type carries something callable, at any depth | a call looked up at runtime cannot be followed by reading |
| `RUST-ERROR:5` | a crate root that appoints no deputies | the cheapest strong rule in the pack: `rustc` and clippy do the work, for free, on every build |
| `RUST-ERROR:6` | something fallible handed to iteration, where the standard library drops the failures | nine rows load, the tenth was malformed, and the report shows nine |
| `RUST-ERROR:7` | `catch_unwind`, `set_hook`, `panic_any` outside the entry point | a net under a crash the caller never hears about |
| `RUST-ERROR:8` | fallible work inside `fn drop` | clean-up on the way out has nowhere to report to |
| `RUST-TYPE:3` | an `Option` in a public signature | absence needs a name before it can be handled |
| `RUST-TYPE:4` | an `as` cast | it truncates, wraps, rounds and re-signs in silence |
| `RUST-TYPE:5` | `wrapping_*`, `saturating_*`, `overflowing_*` and the lossy decoders | a failure turned quietly into a number that travels |
| `RUST-DEAD:3` | `todo!`, `unimplemented!`, `unreachable!` | a runtime panic that compiles, type-checks and looks finished |
| `RUST-DEAD:4` | `use x::*` | nobody can tell where a name came from |
| `RUST-LOG:2` | taking `io::stdout()` or `Stdout` in a type, outside the entry point | the printing decision, one level down where the printing rule cannot see it |
| `RUST-TESTS:1` | `#[test]` and `#[cfg(test)]` under `src/` | a test inside the module tests the inside rather than the promise |
| `RUST-ERROR:9` | a file that cannot be read as Rust at all | looper's own, not the engine's. The engine judges a crate at a time, so one unparseable file takes the whole crate down and the report would otherwise say nothing to fix. Ids 1 to 8 are the engine's; 9 upward are ours |


**The rest of the set, as the engine enforces it.** Each row is the rule's own
ban text; `tests/plan-is-true.test.ts` refuses the suite if a row and its rule
drift apart.

| id | bans |
|---|---|
| `RUST-ERROR:1` | reading a fallible value without handling it. The whole family: `unwrap`, `expect`, `unwrap_err`, `expect_err`, `unwrap_or`, `unwrap_or_else`, `unwrap_or_default`, `ok()`, `err()`, `or()`, `or_else()`, `map_or()`, `map_or_else()`, every `is_ok` / `is_some` / `is_none_or` predicate, `matches!` on one, `if let` and `while let` on `Some`/`Ok`/`Err`/`None`, `let _ =`, an untyped `let _name =`, `==` or `!=` against `None` or `Some(..)`, `drop(call())`, and `let … else` on `Ok`/`Err` |
| `RUST-ERROR:2` | throwing the payload away: `Ok(_)`, `Err(_)`, `Some(_)`, a `_ =>` arm or a catch-all binding in a match on a fallible, an `Err` you bind and never read, and `_` anywhere in a closure's parameters |
| `RUST-ERROR:3` | an `Err` arm that answers with a made-up value: a literal, `None`, `Ok(())`, an empty collection, `Vec::new()`, `String::new()`, `Default::default()` |
| `RUST-ERROR:4` | an `Err` arm that does none of the three things an `Err` arm may do |
| `RUST-TYPE:1` | an error type that says nothing — `String`, `&str`, `dyn` anything, `Box<dyn Error>`, `anyhow`, `eyre`, `()`, a bare primitive or a bare generic — in **any** written type position: a return, a parameter, a struct field, a local annotation, a generic argument |
| `RUST-TYPE:2` | a `Result` with its error half hidden: `type MyResult<T> = Result<T, MyError>`, a one-argument `Result<T>`, or `io::Result<T>` |
| `RUST-DEAD:1` | `#[allow(…)]`, `#[expect(…)]` and `#[cfg_attr(…, allow(…))]` naming `dead_code`, `unused` anything, or `unreachable_code` |
| `RUST-DEAD:2` | comments, all of them — `//`, `/* */`, `///`, `//!` and `#[doc]` |
| `RUST-TRUTH:1` | a default born outside the one file that gathers settings — an absence arm that resolves to a value instead of passing the absence on |
| `RUST-LOG:1` | `println!`, `print!`, `eprintln!` and `eprint!` outside the file that starts the program, and `dbg!` anywhere |

**The boundary rule, which is new and belongs to neither language.**

| id | bans | origin |
|---|---|---|
| `TAURI:1` | `invoke("name")` in TypeScript with no `#[tauri::command]` named `name` in the Rust half | new here. The IPC boundary is a string on one side and a function on the other, and nothing checks that they agree until a user clicks the button. Built 2026-08-17: the Rust half lists its commands through `looper-rust --commands`, the TypeScript half is read for `invoke("…")` where `invoke` came from `@tauri-apps/`, and a name with no command behind it is refused |

`TAURI:1` is the reason to do this properly rather than bolt a second linter on
the side. It is only decidable if one tool reads both halves of the repository,
and it is exactly the failure a mixed-stack project ships.

### Knowing which stack a project is

Detection is by evidence on disk, in one pass, and it is cheap:

| found | means |
|---|---|
| `Cargo.toml` at the root or in a workspace member | a Rust crate; its `[lints]` table is now governed |
| `package.json` | a TypeScript project |
| `src-tauri/tauri.conf.json` | Tauri, so the boundary rule applies and `src-tauri` is the Rust half |
| both, no Tauri | a mixed repository; each file is judged by its own language |

Routing is per file, by extension, and needs no cleverness: `.rs` to the Rust
language reader, `.ts`/`.tsx` to the TypeScript one. The interesting case is what is
**shared**, and the answer is almost everything — one `law.toml`, one
`.looper/baseline.toml`, one report, one set of categories, one set of graded
concessions. A project does not have two laws. It has one law with two readers.

### What has to change in the engine

Small, and named so the work is not underestimated later:

- `Subject` gains the language it is in, and `Check` declares which language it
  reads. `judge` skips a check whose language does not match the subject — the
  same shape as the existing `pass` filter, which already exists and works.
- `JUDGED_EXTENSIONS` gains `.rs`, and the file walk learns `target/` alongside
  `node_modules/`.
- The doctrine tree gains `src/canon/rust.md`, and `map.toml` learns to select
  it by edited file rather than by project.
- `looper init` learns to say which stack it found, because an adopter with a
  mixed repository needs to see that both halves were noticed.
- The parse cache in `src/law/ts/parse.ts` becomes language-aware, or the Rust
  reader gets its own beside it. The memoisation is what keeps the fast pass at
  10ms and it must not be lost.

### The chunks

**Chunk 8a — the lexer.** Rust tokens, exactly: identifiers, lifetimes,
literals including raw and byte strings, nested block comments, attributes,
punctuation, and the positions of all of them. No rules yet.
**Done when:** every `.rs` file in a real Rust repository lexes with no
unrecognised token, and the token stream round-trips to the original text
byte for byte. That round-trip is the whole test — it cannot be argued with.

**Chunk 8b — item structure.** Enough recursive descent to answer: which item is
this token in, is that item `async`, is it under `#[cfg(test)]`, where does each
block start and end.
**Done when:** for a real crate, every token maps to the right enclosing
function, and a hand-checked fixture with nested modules, impls and test modules
comes out right.

**Chunk 8c — the deputy rule alone.** `RUST-TRUTH:2`, which needs no lexer at
all. Ships first because it is the highest value per line in the whole plan.
**Done when:** a crate with no `[lints]` table is refused with the exact table to
paste, and a crate with one passes.

**Chunk 8d — the rule pack.** The table above, each with cases written from its
ban text before the code, and each run over a foreign Rust corpus.
**Done when:** every rule has cases in `audit/cases.ts`, the vocabulary test
covers the Rust token kinds, and the pack has been run over at least
twenty thousand lines of Rust nobody here wrote — with the false positives
judged one at a time, as pass 1 of the audit did.

**Chunk 8e — the boundary.** `TAURI:1`, and the detection that turns it on.
**Done when:** a Tauri fixture with a renamed command is refused, and a correct
one passes.

**Deferred, and named so it is not mistaken for forgotten:** `cargo check` as a
slow-pass deputy. It is the right answer for anything needing types and it costs
seconds, so it belongs on the commit gate if anywhere. Not in 8a–8e.

### What this costs, honestly

The lexer and item reader are the bulk: call it the largest single piece of work
in this plan since the TypeScript reader itself. The rules after it are each
small, because the reading is done.

Nothing crosses from the Rust predecessor. Reading it to learn **what** is worth
enforcing is authorised; its code is not, and none of it will appear here. The
rules above were derived from the prescribed Rust stack rather
than from anything already written.

There is no foreign Rust corpus on this machine. Pass 1 of the audit found a
safety rule catching three of ten because it had only ever met its author's
fixtures, and that lesson applies here before a line is written: **the Rust pack
is not done until it has met a stranger's code.** Naming a corpus is a
precondition of chunk 8d, not a step inside it.

## Freshness: the gate that stops a rule set describing something else

Carried from the Rust predecessor on 2026-08-17, after checking what that
project had and looper did not. It was the only capability worth taking: looper
already had `map.toml` and `[governs]`, and used them to *choose* which rule
sets to inject. It never used them to notice one had gone stale.

The rule is one sentence. **If a commit changes files a rule set governs, and
does not change the rule set, the commit is refused.** Nothing checks a document
against the code it describes, so the commit is the only moment it can be
noticed — after it, the document quietly describes something that is no longer
there.

Two ways on, and both are a decision:

- update the document and stage it beside the change
- or write `Doctrine-freshness: <why>` on its own line in the commit message

The second is deliberately a sentence rather than a flag. "The rename does not
touch what this describes" is an argument someone can disagree with later; a
`--no-verify` is not. It is read from the message **body only** — a line git
will strip as a comment, or one below the scissors, is not a reason, and a
`Doctrine-freshness:` with nothing after it is not one either.

**A reference rots the same way doctrine does.** A key in `[freshness]` ending
in `.md` names a document directly rather than a rule set, so anything can be
watched. `STACK.md` claimed looper read one language for a day after it read
two, and nothing noticed — the gate only ever looked at `.looper/doctrine/`,
because that was the only kind of document it knew about. `STACK.md`,
`README.md` and `CONTRIBUTING.md` are watched now, each against the code that
would make it untrue.

**One map, two purposes, and they want opposite things.** Discovered by the gate
firing on its own author's next commit, two days after it was built. `[governs]`
exists for *injection*, where broad is right: pull the law branch whenever any
code is touched, so looper's own map says `law = ["src/**/*.ts"]`. Staleness
wants the reverse — a document only rots when the thing it describes moves, and
a gate that fires on every commit teaches people to write the bypass line
without reading it. So `map.toml` takes an optional `[freshness]` section with
its own, narrower globs, and falls back to `[governs]` when there is none. A map
written for the predecessor keeps working unchanged, because its branches were
domain-shaped and narrow already.

A branch named in `map.toml` with no document of its own is skipped rather than
refused. There is nothing there to go stale, and a project that has not written
its doctrine yet should not be blocked on every commit for it.

**Done when:** a governed change with an untouched rule set is refused and names
the branch, the file that triggered it and the document to open; the same commit
passes with the document staged; and it passes with a reason given. All three
run in `tests/freshness.test.ts`.

## Nobody is named, including in the check that names them

The canon ships to every adopter, so it carries no name belonging to a project
that adopted looper or to one it was built beside. `tests/canon.test.ts` has
enforced that since chunk 1, by holding a list of forbidden words and refusing
any canon file containing one.

**That list was itself the leak.** A public repository containing
`FOREIGN_VOCABULARY = ["…", "…"]` publishes exactly the thing the check exists
to keep unpublished — and does it in the one file a curious reader is most
likely to open, because it is the file that proves looper is generic.

The words are held as sixteen-character hashes now. The check tokenises each
canon file, fingerprints every word, and refuses a match. It still bites — a
line naming a project was added to `process.md` to confirm it, and the failure
named the word back. Nothing in the source spells any of them.

Everything else went with it on 2026-08-17: the last two mentions anywhere in
the tree, one in a doctrine heading and one in the constitution's index of rule
sets, both rewritten to say *prior work*. A scan for every name across the tree
now returns nothing.

**What deliberately stays.** `vendor/rust-law/` names the author of the engine
it copies, in its `LICENSE` and its `PROVENANCE.md`, and `PLAN.md` names them
where it argues the decision to vendor. 0BSD requires none of that. Removing it
would be erasing whose work it is to make a scan look tidy, which is a different
act from keeping an adopter's name out of a shipped rule set.

## What the canon was missing, and why only some of it could land

Read on 2026-08-17: every markdown file in the predecessor project, its own
canon, its project doctrine, and its docs. That project had already separated
generic from project-specific — its canon is ten branches — so the work was
choosing rather than extracting.

**Five principles were missing here and are worth having anywhere.** They are
now `src/canon/architecture.md`, and every one of them is a thing a model does
wrong unprompted:

- **State has one home and that home is the truth.** Models add a cache without
  being asked, then a reconciliation for the cache.
- **Absence is not an answer.** A value nobody gave you is not a value someone
  set to off. Conflating them lies in a way that looks like data, and it is one
  of the most common quiet bugs there is.
- **A component that refuses to act still has to say so.** A silent refusal and
  a silent success are the same thing from outside. This project found that
  failure in itself four separate times across two audits — findings 16, 17, 34
  and 37 — before reading it stated plainly in somebody else's doctrine.
- **What crosses a boundary is defined once**, and is parsed at the edge.
- **What a person looks at renders what it is told and decides nothing.**

**What did not land, and the reason is a hard ceiling rather than a judgement.**
A Claude Code hook may return at most 10,000 characters. The injection budget of
9,800 is not a preference — it is 200 under a limit nothing here controls, and a
test refuses any budget at or above it, because truncation the agent performs is
truncation looper cannot mark. **So the canon cannot grow. It can only be
chosen.**

Adding 1,050 characters meant finding 1,050 to remove, and the trade is the
record of what stopped earning its place:

| removed | why it stopped earning it |
|---|---|
| four anecdotes in `doctrine.md` | the mechanisms they argued for now exist — `canon.test.ts`, `plan-is-true.test.ts`, the budget test itself |
| "write the document while the work happens" and its detail | the freshness gate asks for exactly that, and asks why if it is missing |
| the softened-three-rules story | the principle survives; the evidence was five lines |
| the `node:child_process` story | same |
| "model the third state", "fail open and fail silent" | the canon now says both, and the project half never repeats the canon |

**Left on the table, deliberately.** Design tokens defined once and one-of-
everything-reused, from that project's interface doctrine: good practice, but a
model does not reach for the opposite as readily as it reaches for a cache.
Primary sources only, and a measurement written with its date and raw output:
already in this project's own doctrine, and not yet worth the always-on cost for
an adopter. Both are worth revisiting when something else stops earning its
place.

## The audit: seven passes, one pile

Everything here was built and tested by the same author, against fixtures that
author wrote, on the one repository that author controls. That is the weakest
possible evidence and it is worth saying plainly before any of it is trusted.
`TS-ERROR:4` reported eight problems here and six were its own false positives —
found only because it was pointed at real code rather than at its own fixtures.

The audit is chunked because an audit that runs everything at once produces a
list nobody clears. Each pass answers one question, and findings go to
FINDINGS.md. **A pass records; it never fixes.** Fixing as you go means auditing a
moving target, and the count at the end stops meaning anything.

### 1. Foreign code — the false positive hunt

Run the whole rule set over TypeScript nobody here wrote, at least a few thousand
lines of it. Every violation is a candidate `blunt` until judged one by one: is
this code genuinely wrong, or is the rule?

This is first because it is the only pass that can find what the others
structurally cannot. Every rule so far has agreed with its author, because its
author wrote both the rule and the code it was tested on.

**Needs a corpus, and there is none on this machine.** Any real TypeScript
project will do. Name it before starting.

### 2. Evasion — the false negative hunt

For each of the 23 rules, deliberately write code that breaks its spirit and
passes it anyway. Every success is a `wrong`. The consumer is an optimizer, so
this is the pass that tests the non-gameable property rather than assuming it:
a hand-rolled logger, a laundered value, a rule dodged one spelling over.

### 3. Failure modes — what happens when things are broken

Feed every component input it was not built for. A malformed `law.toml`, a
corrupt baseline, an unreadable file, an empty repository, a detached HEAD, a
merge in progress, a symlink loop, a 50,000-line file, a file that is not UTF-8.
Two questions each time: does it reach a wrong verdict, and can it wedge the
session? The second is worse. Every crash on the hook path is a `wrong`.

### 4. Scale — where it stops being acceptable

Generate projects of 100, 1,000 and 10,000 files and measure every moment: the
edit gate, the commit gate, `looper law`, the Stop hook. The slow pass is the
suspect, because it reads the module graph and nothing has ever bounded that.
Findings are `slow`, with the number and the size that produced it.

### 5. Messages — the audience bar

Every rule message read against the claim that it reads to someone who cannot
code. Mechanically checkable: every rule has at least one legal spelling, no
message contains an identifier from the engine, no message is longer than a
screen. The rest is reading them one at a time and asking whether a person who
has never seen a stack trace could act on it. Findings are `noise`.

### 6. Claims — the plan against reality

Every "Done when" in this document and every claim in a rule's `why`, checked
against a test or a run. Anything asserted and unproven is a `missing`. This is
the pass that catches "written is not delivered", which has happened three times
already and was found by accident each time.

### 7. Consolidation — the sweep, widened

The scan already run over function bodies, extended to repeated string literals,
whole files with the same shape, doctrine that says one thing twice, and exports
nobody imports. Findings are `noise`.

### Clearing the pile

Only after every pass has run. In severity order: `wrong`, then `blunt`, then
`missing`, then `slow`, then `noise`. A `blunt` outranks a `missing` because a
false positive gets the tool switched off and then nothing else matters.

## The licence, and what going public actually needs

**Resolved 2026-08-17: Zero-Clause BSD.** The brief was that anyone can use the
code exactly as they want, and 0BSD is the only common licence that means that
without a condition attached: use, copy, modify, distribute, sell, no
attribution, no notice to retain, nothing to carry.

MIT was the alternative and it fails the brief by one clause — it requires the
copyright notice to travel with every copy, which is a condition however small.
Apache-2.0 adds a patent grant and two more obligations. Neither is wrong; both
are more than was asked for.

There is a second argument that settles it here. `vendor/rust-law` is already
0BSD. Licensing looper the same way makes the whole repository one licence with
zero conditions, and removes any question about how the two interact — a
question a reader would otherwise have to answer before using it.

**What "ready" required, and what is done.** `LICENSE`, `README.md` and
`CONTRIBUTING.md` all exist, and a test refuses the suite if any of them goes
missing. `package.json` declares `0BSD` and a test holds it to the same licence
the file states. The vendored engine keeps its own `LICENSE` and
`PROVENANCE.md`, and a test refuses to let either be deleted — 0BSD obliges
neither, and shipping 3,900 lines of somebody else's work without saying whose
is a different thing from what the licence permits.

**What was checked rather than assumed.** The repository was scanned for every
name that must not ship: no employer, no adopter, no personal path. The only
hits are `tests/canon.test.ts`, where those words are the blocklist that keeps
them out of the shipped canon, and `vendor/rust-law`, where a name is the
provenance. `.looper/doctrine/sources.md` was corrected in the same pass: it
said prior work is *"never a reference"*, which stopped being true the day the
Rust law was vendored.

**The one flag left.** `package.json` still says `"private": true`, deliberately,
so nothing can be published by accident before the decision is taken. A test
asserts it is still there and says to delete the test along with the flag. That
is the whole of the remaining work.

## Decisions taken

| item | decided |
|---|---|
| provenance | built from scratch; no code, artifacts, rule files or fixtures from any other project, and nothing wrapped |
| adopter specifics | never in this repo: an adopting organisation's architecture, vendors or product stay outside the plan and outside the canon |
| the pillars | no dead code, one source of truth, no fallbacks ever, verify everything, never fail silently, say it every turn |
| strictness | every pillar is a gate, and every gate has a visible concession path; a rule with no appeal gets disabled wholesale |
| audience | any team, any project; depth is detected from the repo, never declared, and what does not apply is silent |
| shape | container plus plugin capabilities, one trait |
| language | TypeScript on Node ≥ 22: the team can read it, and the measured hook tax is affordable |
| distribution | npm package, bundled single-file entry, no native modules |
| navigator | not built, and nothing is built on one |
| law engine | ours, one neutral engine with a language reader per language |
| law checker | not eslint: a project-configurable linter is not a law |
| stack | prescribed, not accommodated: one language, TypeScript, everywhere |
| stack picks | one tool per job, listed in STACK.md and argued under "The stack looper governs" |
| languages off the stack | governed shallowly by the language-agnostic capabilities; no law until tier B is earned |
| reader tiers | A (deep, scope-aware) covers the whole prescribed stack; B (CST, thinner) designed but deferred |
| coverage | TS, JS, JSX/TSX + React, Next, Node, Data packs; React Native free with React |
| parsers | `@babel/parser` for tier A, verified 2026-08-17; `web-tree-sitter` WASM for tier B if ever built |
| rule classes | constitutive (the language allows it by default, ships day one) and reactive (caught bypasses only) |
| the tie-break | where two readings are defensible, the stricter one wins — and it is usually the more decidable, which is what makes it robust rather than merely severe. Budget, convention and "a beginner would find this harsh" are not arguments |
| the rule table | derived 2026-08-17 from how TypeScript goes wrong: 12 carry unchanged, 14 rewritten, 1 dropped as a deliberate absence, 1 moved to `NODE`, 4 added, and everything that survives ships constitutive |
| the axis rules are judged on | precision, never severity: the agent pays severity in the same turn from the repair prompt, and only imprecision burns turns and teaches the law is noise |
| `TS-TRUTH:1` | full strength, every spelling, and it is the *more precise* reading — the judgment that could misfire only existed while the rule was being written leniently. The compliant path is always a statement, so no type knowledge is needed to recognise it |
| the sanctum | `config.ts`, matched by filename so a workspace package may each have one; a single name, never a list |
| comments | banned in full, and the case is stronger here than in a language read by people: the primary reader is a model, and a stale comment overrides the code for a reader who cannot check it |
| not the TS compiler API **for the fast pass** | 12× the load cost, and `typescript@7` has removed the syntax API. The slow pass is the opposite case and uses it |
| SQL | a tier A call-site rule, not a reader of its own |
| rule ids | namespaced per language reader, categories shared |
| layer maps | ship empty and inert, per language |
| rule sets | ship full, grow only on caught bypasses |
| law timing | edit-time repair prompt, a survey at install, a report when the agent stops, and commit-time refusal — four moments, none of them a person deciding to check |
| nothing behind a command | no gate waits to be invoked and no fact that must be seen waits in a command's output; the user cannot be expected to know a command exists, and cannot judge when running it would have helped |
| two passes | fast (one file, syntax, ~70 ms) and slow (whole project, types, seconds); one engine, one report format, a rule declares which pass it belongs to |
| why the slow pass | not mainly the floating promise: on a repo that already has code, the fast pass only ever sees the files the agent touches, so without it looper has no opinion about the work it was pointed at |
| type source | **none**: measured 2026-08-17, `typescript` is 23 MB and ships `_tsserver.js`, which requires the network modules. The slow pass walks the module graph with our own parser instead |
| how the slow pass reads packages | it parses the `.d.ts` files already in the project's own `node_modules`. A declaration file holds no runnable code, so reading one runs nothing and installs nothing |
| what the slow pass still misses | a promise reached through a value rather than an imported name, `db.query(...)` where `db` came from `new Pool()`. That needs the type of the receiver, which is where real inference begins |
| the baseline | `.looper/baseline.toml`, committed, per file and rule; covers untouched code only, so a violation on a touched line is never baselined; shrinks automatically, refuses growth, pushed rather than stored, and never confused with a pardon — it records debt, not permission |
| new files after adoption | judged in full from the first line; the baseline covers only what was already there |
| init on an occupied repo | merge, never clobber, and never report a file wired that was not |
| `core.hooksPath` | **never set by us, and never needed**: git runs `.git/hooks` with no configuration, verified. init writes into whatever directory git already looks in. An existing hook is never overwritten; the gate is reported not-wired and the one line to add is printed |
| what refuses a commit | only a verdict of block. Missing, broken or unreachable looper lets the commit through saying it was not checked — refusing on its own failure is the worst outcome a governance accessory has |
| self-sufficiency | the system finishes what it starts: if a step is needed for looper to work, looper does it. Printing an instruction is not shipping the feature |
| what earns a question | what the thing should do, what costs money, what cannot be undone — and nothing else. Never an implementation fork, in words with no jargon in them |
| concessions at depth 1 | closed. A valve assumes a reviewer and there is none; the agent finds the compliant path or keeps working, and never offers the user an exit it cannot judge |
| an undischargeable violation | our defect, recorded as one — never handed to the user as a technical decision |
| doctrine on an existing repo | **reversed**: proposed by the loop and ratified by evidence, not by a human. A reader who cannot read code either waves every rule through or never opens the file, so the gate is theatre either way |
| what ratifies an adopted rule | it fires on real code here, every instance is rewritten, the project still passes, and the evidence is recorded with it. Mechanical, so no opinion is needed |
| what an adopted rule may be | an instance of a shape the engine already knows, never new code — the moment a project can author rules, the optimizer edits the rules instead of the code |
| the return path | adopter agents report rules they cannot discharge; that is where the evidence for reactive rules comes from |
| git, never a git host | looper runs `diff`, `show`, `ls-files` and `diff-tree` and knows no hosting provider's name. GitLab, Bitbucket, Gitea, a bare repo with no remote: all identical. The return path produces a file; how it travels is the adopter's |
| who transports it | never looper, which stays socket-incapable; the adopter's agent, which already has network access and is already watched |
| what a report may carry | a minimal synthetic reproduction and the version, never the adopter's source, identifiers or paths; unminimisable means unsent |
| adopters install, never fork | a fork is N copies of a canon compiled in precisely so it cannot drift; forks are for people changing looper itself |
| written as if public | from now, whatever the repo's setting: it costs nothing, removes the retrofit, and reasoning aimed at a skeptical outsider is sharper |
| opening the repo | decided: it goes public, one repo, plan and scar log included. The case is verifiability — a tool hooked into every edit and commit should be auditable — and nothing in the plan is a moat. The switch waits for the law engine; the writing discipline does not |
| licence | undecided, required before the switch, and the one decision here that is legal rather than technical: permissive maximises adoption, an explicit patent grant is what corporate legal teams look for |
| the scar log in the open | stays, with one guard: an adopter incident is recorded as the construct and the rule, never the company, the codebase or the person |
| network | none, forever, checked at the socket layer in the resolved tree |
| secret detection | by shape, never by a list of names, because a list you choose cannot cover a vocabulary a vendor owns |
| what secrets scans | added lines in the staged diff, every file type, so adopting looper is not refused over history it did not write |
| recall is committed | a note nobody can see is a note nobody can correct, and a wrong one is believed. Shared is also where its value is. Reverses the prior art, which keeps it local |

## Assumptions stated in the open

- **Tier B is unverified and unbuilt.** Tier A is measured and stands.
- **The slow pass is unmeasured.** Which TypeScript compiler API answers "does
  this call finish later", on which version line, and what a whole-project read
  costs on a real repo are all assumed and none are measured. If the honest
  number turns out to be a minute rather than seconds on a large codebase, the
  slow pass stops being a commit gate and becomes an on-demand survey plus a CI
  step — which changes where it is wired, not whether it exists. Measured in
  chunk 2, before rules are written against it.

Three parts of the prescribed stack are asserted without confirmation, and each
would change a decision above rather than merely a detail:

- **Auth is assumed to already exist.** Any organisation with existing users has
  an identity system and it wins by default. Where a project is genuinely
  greenfield the pick is better-auth (TypeScript-native, Drizzle adapter) or a
  managed provider, and that decision is not taken here.
- **Deployment is assumed to be self-hosted infrastructure,** not a managed
  platform. It changes the API topology if wrong.
- **No CPU-bound work is assumed.** Node is excellent at I/O and mediocre at
  compute. Transcoding, media processing and heavy batch jobs are the honest
  case for keeping another language, and uniformity is not a good enough reason
  to move them.

## Traps recorded before they bite

- **`core.hooksPath` is single-valued.** Pointing it somewhere new silently
  disables everything the project already had. Write into the existing directory,
  never create a second, and never *repoint* one that is already set — init only
  ever sets it where it is unset, and only with the human's yes.
- **Skip is not merge.** A file that already exists and was left alone is a hook
  that never runs. Report the difference between wired and skipped, loudly.
- **The installed build is the gate.** A stale install runs yesterday's law with
  no symptom at all. `looper status` prints its own build identity and says when
  the source tree is newer than the build that is answering — but a stale build is
  precisely the case where nobody suspects anything is wrong, so nobody runs
  `status`, so it **pushes**: one line on the injection channel until it is
  resolved. A warning that waits to be asked for is not a warning. This is worse
  in npm than it would have been in Cargo, because a project can pin an old
  version in its lockfile and never notice.
- **Never put `npx` in a hook command.** It re-resolves on every invocation and
  would dwarf the entire measured budget. Hooks point at a resolved binary path.
- **The no-network invariant is harder in npm and must be enforced, not audited.**
  A dependency tree here is deeper than a crate graph and has postinstall scripts
  in it. Three measures, all required: keep the direct dependency count near zero,
  install with scripts disabled and audit anything that wants one, and assert at
  runtime that the network modules were never loaded. The runtime assertion is
  the one that actually holds, and it is stronger than the tree audit it replaces.
- **Node's startup floor is 18 ms and it is not ours to optimise.** Anything that
  wants to be cheaper than that has to not be a process, which is a real design
  option and not one we are taking yet.
- **A hook payload is data from outside.** Any path from one is resolved and must
  sit under the project root before it is touched.
- **Fail open, never closed,** everywhere except the law and the secrets gate,
  whose whole purpose is to block. Those two block only on a verdict they
  actually reached, never on their own failure. A governance accessory must never
  be able to wedge the session it was only supposed to watch.
- **Multi-language repos are the normal case.** A language reader that assumes it owns
  the repo will mis-judge the other half of it.

## Next step

Chunk 0, and inside it the merge path first: `init` against a repo that already
has an agent settings file with a foreign hook, proving the file comes out with
both hooks in it. That is property 2 in one test, and everything else in the
container is the proven part.
